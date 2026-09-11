import {
  CancelablePromise,
  CancelError,
  createCancelSignal,
  IExecutorContext,
  isCancelSignal,
  TimeoutError,
} from '@cancjs/promise';

import { resolveTimers, startTimer, stopTimer, TTimersOverride } from '../../_toolbox/timers';
import { isAbortError, isFunction } from '../../_util';

// Minimal structural stand-ins so the source stays buildable in environments without
// DOM/Node fetch lib types
type AbortControllerCtor = new () => { abort: (reason?: any) => void; signal: any };
type Fetch = (input: any, init?: any) => Promise<any>;

declare const fetch: Fetch;
declare const AbortController: AbortControllerCtor;

export interface ICancelableFetchConfig {
  fetch?: Fetch;
  // Callers in environments with faulty or missing polyfills can supply a working
  // AbortController here
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

// Missing config keys fall back to ambient globals read at call time to avoid touching them
// in environments lacking them
const resolveDep = <T>(config: Record<string, any>, key: string, global: T): T =>
  key in config ? (config[key] as unknown as T) : global;

/**
 * Shared cancel-signal wiring returned by {@link setupCancellation}. `signal` is what to pass into
 * `fetch`, `finalize` detaches whatever the caller's original signal was wired to, and
 * `toRejection` normalizes a fetch rejection into a CancelError when appropriate.
 */
export interface IFetchCancellation {
  signal: any;
  finalize: () => void;
  // Normalizes a fetch rejection: an abort becomes a clean CancelError, anything else passes
  // through untouched.
  toRejection: (reason: any) => any;
}

/**
 * Builds the cancel-signal wiring shared by every product this factory can build (immediate fetch
 * and the lazy/later variants): mints a signal (or adopts an injected `AbortController`), forwards
 * an external caller signal onto it, turns `.cancel()` into a clean CancelError, and maps an abort
 * rejection back to that CancelError. Takes `handleCancel` from the CancelablePromise executor and
 * returns the `signal` to pass into fetch plus a `finalize` to call once the request settles.
 */
export const setupCancellation = (
  config: ICancelableFetchConfig,
  input: any,
  init: any,
  handleCancel: IExecutorContext<any, any>['handleCancel'],
): IFetchCancellation => {
  const _AbortController = resolveDep<AbortControllerCtor>(
    config,
    'AbortController',
    typeof AbortController !== 'undefined' ? AbortController : (undefined as unknown as AbortControllerCtor),
  );

  // A signal can come from init or from a Request-object input; either drives external abort.
  const initSignal = (init as { signal?: unknown } | undefined)?.signal;
  const inputSignal = (input as { signal?: unknown } | undefined)?.signal;
  const originalSignal = (initSignal || inputSignal) as PolyfilledAbortSignal | null | undefined;

  // Honor injected custom AbortController otherwise reuse createCancelSignal whose branded
  // signal already aborts with CancelError
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

  // Detaches from caller's long-lived signal so a signal reused across fetches does not
  // accumulate listeners
  let detachSignal = () => {};

  if (originalSignal) {
    if (originalSignal.aborted) {
      // Forward pre-aborted input reason immediately so a caller cancel signal cancels with
      // its own CancelError verbatim
      abort(originalSignal.reason);
    } else if (isFunction(originalSignal.addEventListener)) {
      // Prefer addEventListener on native signals as it does not mutate the caller's object
      // and survives onabort reassignment
      const externalAbortListener = () => {
        abort(originalSignal.reason);
      };
      originalSignal.addEventListener('abort', externalAbortListener);

      if (isFunction(originalSignal.removeEventListener)) {
        detachSignal = () => originalSignal.removeEventListener!('abort', externalAbortListener);
      }
    } else if ('onabort' in originalSignal) {
      // Legacy fallback chains onabort and restores the original handler on settle to
      // leave signal in its original state
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
      // The cancel signal already aborts with a CancelError; a spec-compliant fetch rejects
      // with that exact error, so pass it through verbatim.
      return reason;
    }

    if (isAbortError(reason)) {
      // Cancellation rejects with a CancelError caused by AbortError rather than bare
      // AbortError since cancellation is not a failure
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

/**
 * Failures that a cancelable fetch or fetchLater request can reject with.
 * Note: a request canceled via canc .cancel() rejects with a CancelError whose cause is an
 * AbortError, NOT a bare AbortError. Cancellation is not a failure, so that path does not
 * contribute to the declared failure set.
 */
export type TCancelableFetchFailure = TimeoutError;

export const cancelableFetchFactory = (config: ICancelableFetchConfig = {}) => {
  return function cancelableFetch(input: any, init?: any): CancelablePromise<any, TCancelableFetchFailure> {
    return new CancelablePromise<any, TCancelableFetchFailure>((resolve, reject, { handleCancel }) => {
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
// Local structural stand-in so a future built-in FetchLaterResult stays assignable with
// no name clash
export interface IFetchLaterResultLike {
  readonly activated: boolean;
}

// Structural stand-in for deferred-request init mirroring a normal fetch init with an
// added activateAfter timeout
export type TDeferredRequestInit = Record<string, any> & { activateAfter?: number };

type FetchLater = (input: any, init?: TDeferredRequestInit) => IFetchLaterResultLike;

declare const fetchLater: FetchLater;

// A plain interface cannot extend TTimersOverride (it is a union, half a pair or none), so this
// stays a type alias.
export type ICancelableFetchLaterConfig = ICancelableFetchConfig &
  TTimersOverride & {
    fetchLater?: FetchLater;
    // Poll interval in milliseconds for the FetchLaterResult activated flag when
    // activateAfter is set
    pollInterval?: number;
  };

// CancelablePromise merged with live FetchLaterResult resolving to IFetchLaterResultLike
export type TCancelableFetchLaterPromise = CancelablePromise<IFetchLaterResultLike, TCancelableFetchFailure> & {
  readonly activated: boolean | null;
};

const DEFAULT_POLL_INTERVAL = 500;

// Attach a live `.activated` getter defined non-enumerable so it does not interfere with
// promise internals
export const attachActivated = (
  promise: CancelablePromise<IFetchLaterResultLike, TCancelableFetchFailure>,
  getResult: () => IFetchLaterResultLike | null,
): TCancelableFetchLaterPromise => {
  Object.defineProperty(promise, 'activated', {
    configurable: true,
    enumerable: false,
    get(): boolean | null {
      const result = getResult();
      return result ? result.activated : null;
    },
  });

  return promise as TCancelableFetchLaterPromise;
};

// The shared fetchLater run sets the live FetchLaterResult so `.activated` can read it
// and drives the promise
export const runFetchLater = (
  config: ICancelableFetchLaterConfig,
  input: any,
  init: TDeferredRequestInit | undefined,
  resolve: (value: IFetchLaterResultLike) => void,
  reject: (reason: any) => void,
  handleCancel: IExecutorContext<any, any>['handleCancel'],
  setResult: (result: IFetchLaterResultLike) => void,
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

  let result: IFetchLaterResultLike;
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
    // Without activateAfter the real send happens at page-end so the promise stays pending
    // until cancel
    return;
  }

  const pollInterval = typeof config.pollInterval === 'number' ? config.pollInterval : DEFAULT_POLL_INTERVAL;
  const timers = resolveTimers(undefined, config);

  let timerHandle: any;

  // Recursive setTimeout, not setInterval: a tick that runs long never overlaps the next one, and
  // the handle rebinds every tick so cancel always clears whichever wait is currently pending.
  const poll = (): void => {
    timerHandle = startTimer(
      () => {
        if (result.activated) {
          finalize();
          resolve(result);
          return;
        }

        poll();
      },
      pollInterval,
      timers,
    );
  };

  poll();

  handleCancel(() => {
    stopTimer(timerHandle, timers);
  });
};

export const cancelableFetchLaterFactory = (config: ICancelableFetchLaterConfig = {}) => {
  return function cancelableFetchLater(input: any, init?: TDeferredRequestInit): TCancelableFetchLaterPromise {
    let result: IFetchLaterResultLike | null = null;

    const promise = new CancelablePromise<IFetchLaterResultLike, TCancelableFetchFailure>(
      (resolve, reject, { handleCancel }) => {
        runFetchLater(config, input, init, resolve, reject, handleCancel, (r) => {
          result = r;
        });
      },
    );

    return attachActivated(promise, () => result);
  };
};
