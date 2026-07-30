import { CancelablePromise, CancelError, createCancelSignal, isCancelSignal } from '@cancjs/promise';

import { isFunction, isObject } from '../../_util';

// Minimal structural stand-ins so the source stays buildable in environments without DOM/Node fetch
// lib types. The real shapes come from whatever globals or config the caller supplies at runtime.
type AbortControllerCtor = new () => { abort: (reason?: any) => void; signal: any };
type Fetch = (input: any, init?: any) => Promise<any>;

declare const fetch: Fetch;
declare const AbortController: AbortControllerCtor;

export interface CancelableFetchConfig {
  fetch?: Fetch;
  // A caller can inject an AbortController implementation. Environments with a faulty or missing
  // AbortController polyfill (some SSR/legacy runtimes) let the caller supply a working one here,
  // which is the whole reason this stays a factory rather than a plain function.
  AbortController?: AbortControllerCtor;
}

// External signals may be polyfilled and lack addEventListener/onabort, so treat those members as
// optional and feature-detect before use.
interface PolyfilledAbortSignal {
  aborted?: boolean;
  reason?: any;
  onabort?: ((this: any, event: any) => any) | null;
  addEventListener?: (type: string, listener: (event: any) => void) => void;
  removeEventListener?: (type: string, listener: (event: any) => void) => void;
}

const isAbortError = (error: any): boolean =>
  isObject(error) && typeof (error as any).message === 'string' && (error as any).name === 'AbortError';

// A missing config key falls back to the ambient global, read at call time (not at factory
// creation) so importing the default entry never touches `fetch`/`AbortController` in an
// environment that lacks them. Callers wanting eager binding pass the globals in explicitly.
const resolveDep = <T>(config: Record<string, any>, key: string, global: T): T =>
  key in config ? (config[key] as unknown as T) : global;

// Wiring shared by every product this factory can build (immediate fetch, and the lazy/later
// variants). It owns the whole cancel-signal lifecycle: mint a signal to hand the underlying
// fetch, forward an external caller signal onto it, turn `.cancel()` into a clean CancelError, and
// map an abort rejection back to that CancelError. The caller supplies `handleCancel` (from the
// CancelablePromise executor) and gets back the `signal` to pass into fetch plus a `finalize` to
// call once the request settles.
export interface FetchCancellation {
  signal: any;
  finalize: () => void;
  // Normalizes a fetch rejection: an abort becomes a clean CancelError, anything else passes
  // through untouched.
  toRejection: (reason: any) => any;
}

export const setupCancellation = (
  config: CancelableFetchConfig,
  input: any,
  init: any,
  handleCancel: (onCancel: () => void) => void,
): FetchCancellation => {
  const _AbortController = resolveDep<AbortControllerCtor>(
    config,
    'AbortController',
    typeof AbortController !== 'undefined' ? AbortController : (undefined as any),
  );

  // A signal can come from init or from a Request-object input; either drives external abort.
  const originalSignal = (init?.signal || (input as any)?.signal) as PolyfilledAbortSignal | null | undefined;

  // When the caller injects a custom AbortController, honor it (that injection is the factory's
  // reason to exist). Otherwise reuse createCancelSignal, whose branded signal already aborts with
  // a CancelError, so a spec-compliant fetch rejects with that error verbatim and no mapping is
  // needed.
  const injected = 'AbortController' in config;
  let signal: any;
  let cancel: (reason?: any) => void;

  if (injected) {
    const controller = new _AbortController();
    signal = controller.signal;
    cancel = () => controller.abort();
  } else {
    const cancelSignal = createCancelSignal();
    signal = cancelSignal.signal;
    cancel = cancelSignal.cancel;
  }

  let done = false;

  const abort = (reason?: any) => {
    if (!done) {
      done = true;
      cancel(reason);
    }
  };

  // Detaches whatever we wired onto the caller's long-lived signal, so a signal reused across
  // many fetches does not accumulate listeners. Reassigned when a signal is present.
  let detachSignal = () => {};

  if (originalSignal) {
    if (originalSignal.aborted) {
      // Pre-aborted input: abort our signal immediately, before fetch runs. Forward the reason so
      // a caller cancel signal cancels with its own CancelError verbatim.
      abort(originalSignal.reason);
    } else if (isFunction(originalSignal.addEventListener)) {
      // Native signals (and modern polyfills) expose addEventListener; prefer it. It does not
      // mutate the caller's object, and survives the caller reassigning onabort later.
      const externalAbortListener = () => {
        abort(originalSignal.reason);
      };
      originalSignal.addEventListener('abort', externalAbortListener);

      if (isFunction(originalSignal.removeEventListener)) {
        detachSignal = () => originalSignal.removeEventListener!('abort', externalAbortListener);
      }
    } else if ('onabort' in originalSignal) {
      // Legacy-polyfill fallback: no addEventListener, so chain onabort. Restore the original
      // handler on settle so the signal is left as we found it.
      const originalOnAbort = originalSignal.onabort;

      originalSignal.onabort = function (this: any, event: any) {
        abort(originalSignal.reason);

        if (isFunction(originalOnAbort)) {
          originalOnAbort.call(this, event);
        }
      };

      detachSignal = () => {
        originalSignal.onabort = originalOnAbort ?? null;
      };
    }
  }

  handleCancel(() => abort());

  const toRejection = (reason: any) => {
    if (isCancelSignal(signal) && signal.aborted) {
      // Our own cancel signal already aborts with a CancelError; a spec-compliant fetch rejects
      // with that exact error, so pass it through verbatim.
      return reason;
    }

    if (isAbortError(reason)) {
      return new CancelError(reason.message, { cause: reason });
    }

    return reason;
  };

  return {
    signal,
    finalize: () => detachSignal(),
    toRejection,
  };
};

export const cancelableFetchFactory = (config: CancelableFetchConfig = {}) => {
  return function cancelableFetch(input: any, init?: any): CancelablePromise<any> {
    return new CancelablePromise<any>((resolve, reject, { handleCancel }) => {
      const _fetch = resolveDep<Fetch>(config, 'fetch', typeof fetch !== 'undefined' ? fetch : (undefined as any));
      const { signal, finalize, toRejection } = setupCancellation(config, input, init, handleCancel);

      const settle =
        <T>(callback: (value: T) => void) =>
        (value: T) => {
          finalize();
          callback(value);
        };

      _fetch(input, { ...init, signal }).then(
        settle(resolve),
        settle((reason: any) => reject(toRejection(reason))),
      );
    });
  };
};

// The fetchLater() API returns a FetchLaterResult synchronously (not a promise, no response body).
// Its `activated` flag flips to true once the deferred request is actually sent. Local structural
// stand-in so a future built-in FetchLaterResult stays assignable with no name clash.
export interface FetchLaterResultLike {
  readonly activated: boolean;
}

// Structural stand-in for the deferred-request init. `activateAfter` (ms) sets a send timeout;
// absent means the browser sends at page-visit end. Everything else mirrors a normal fetch init.
export type DeferredRequestInit = Record<string, any> & { activateAfter?: number };

type FetchLater = (input: any, init?: DeferredRequestInit) => FetchLaterResultLike;

// Structural timer stand-ins so the source builds without DOM/Node lib types. The handle is opaque;
// only round-tripping it back into clearInterval matters.
type TimerHandle = any;
declare const setInterval: (handler: () => void, timeout?: number) => TimerHandle;
declare const clearInterval: (handle: TimerHandle) => void;

declare const fetchLater: FetchLater;

export interface CancelableFetchLaterConfig extends CancelableFetchConfig {
  fetchLater?: FetchLater;
  // Interval, in milliseconds, at which the FetchLaterResult `activated` flag is polled when
  // `activateAfter` is set. Defaults to 500.
  pollInterval?: number;
}

// A CancelablePromise merged with the live FetchLaterResult. Resolves to the FetchLaterResultLike
// (never a Response, none is exposed). `.activated` reads the live result, or null before the
// underlying fetchLater() has been called (only possible for the lazy variant before it starts).
export type CancelableFetchLaterPromise = CancelablePromise<FetchLaterResultLike> & {
  readonly activated: boolean | null;
};

const DEFAULT_POLL_INTERVAL = 500;

// Attach a live `.activated` getter that reads the current FetchLaterResult through `getResult`,
// returning null before the result exists. Defined non-enumerable so it does not interfere with
// promise internals.
export const attachActivated = (
  promise: CancelablePromise<FetchLaterResultLike>,
  getResult: () => FetchLaterResultLike | null,
): CancelableFetchLaterPromise => {
  Object.defineProperty(promise, 'activated', {
    configurable: true,
    enumerable: false,
    get(): boolean | null {
      const result = getResult();
      return result ? result.activated : null;
    },
  });

  return promise as CancelableFetchLaterPromise;
};

// The shared fetchLater run: call the underlying fetchLater() (mapping a sync throw to a reject),
// then either poll `activated` (when activateAfter is set) or stay pending until cancel. `setResult`
// stores the live FetchLaterResult so `.activated` can read it. Returns nothing; drives the promise
// through the passed resolve/reject.
export const runFetchLater = (
  config: CancelableFetchLaterConfig,
  input: any,
  init: DeferredRequestInit | undefined,
  resolve: (value: FetchLaterResultLike) => void,
  reject: (reason: any) => void,
  handleCancel: (onCancel: () => void) => void,
  setResult: (result: FetchLaterResultLike) => void,
): void => {
  const _fetchLater = resolveDep<FetchLater>(
    config,
    'fetchLater',
    typeof fetchLater !== 'undefined' ? fetchLater : (undefined as any),
  );

  if (!isFunction(_fetchLater)) {
    reject(new Error('fetchLater is not available; provide one via config.fetchLater'));
    return;
  }

  const { signal, finalize } = setupCancellation(config, input, init, handleCancel);
  handleCancel(finalize);

  let result: FetchLaterResultLike;
  try {
    // A sync throw (quota/range/type) surfaces as a raw rejection, not a CancelError.
    result = _fetchLater(input, { ...init, signal });
  } catch (error) {
    finalize();
    reject(error);
    return;
  }

  setResult(result);

  const activateAfter = init?.activateAfter;

  if (typeof activateAfter !== 'number') {
    // No activateAfter: the real send happens at page-end and is unobservable, so the promise
    // stays pending until cancel. Cancel aborts the deferred send through the shared cancellation
    // wiring (setupCancellation already registered the abort on cancel).
    return;
  }

  const pollInterval = typeof config.pollInterval === 'number' ? config.pollInterval : DEFAULT_POLL_INTERVAL;

  const intervalHandle = setInterval(() => {
    if (result.activated) {
      clearInterval(intervalHandle);
      finalize();
      resolve(result);
    }
  }, pollInterval);

  handleCancel(() => {
    clearInterval(intervalHandle);
  });
};

export const cancelableFetchLaterFactory = (config: CancelableFetchLaterConfig = {}) => {
  return function cancelableFetchLater(input: any, init?: DeferredRequestInit): CancelableFetchLaterPromise {
    let result: FetchLaterResultLike | null = null;

    const promise = new CancelablePromise<FetchLaterResultLike>((resolve, reject, { handleCancel }) => {
      runFetchLater(config, input, init, resolve, reject, handleCancel, (r) => {
        result = r;
      });
    });

    return attachActivated(promise, () => result);
  };
};
