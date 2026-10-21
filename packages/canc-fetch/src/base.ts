import {
  CancelablePromise,
  CancelError,
  createCancelSignal,
  IExecutorContext,
  isCancelSignal,
  Unlisted,
} from '@cancjs/promise';

import { resolveTimers, startTimer, stopTimer, TTimersOverride } from '../../_toolbox/timers';
import { isAbortError, isFunction, isObject, isTimeoutError, toCancelError } from '../../_util';

// Minimal structural stand-ins so the source stays buildable in environments without
// DOM/Node fetch lib types
type AbortControllerCtor = new () => { abort: (reason?: any) => void; signal: any };
type Fetch = (input: any, init?: any) => Promise<any>;

declare const fetch: Fetch;
declare const AbortController: AbortControllerCtor;
declare const AbortSignal: { any?: (signals: any[]) => any } | undefined;

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
 * `fetch`, `abort` aborts it at any time (also after the response arrived, so a body read stops),
 * `finalize` detaches whatever the caller's original signal was wired to, and `toRejection`
 * normalizes a fetch rejection into a CancelError when appropriate.
 */
export interface IFetchCancellation {
  signal: any;
  abort: (reason?: any) => void;
  finalize: () => void;
  // Normalizes a fetch rejection: an abort becomes a clean CancelError, anything else passes
  // through untouched.
  toRejection: (reason: any) => any;
}

// RequestInit members a class instance or a Request may hold as non-enumerable getters
const INIT_KEYS = [
  'activateAfter',
  'body',
  'cache',
  'credentials',
  'duplex',
  'headers',
  'integrity',
  'keepalive',
  'method',
  'mode',
  'priority',
  'redirect',
  'referrer',
  'referrerPolicy',
  'window',
];

// a spread drops inherited and getter members, so a POST built on a prototype went out as a GET
const copyInit = (init: any, signal: any): any => {
  const copy: Record<string, any> = {};

  if (isObject(init)) {
    const copyKey = (key: string) => {
      // a JSON.parse own __proto__ would reset the prototype through plain assignment
      if (key !== '__proto__' && !Object.prototype.hasOwnProperty.call(copy, key)) {
        copy[key] = init[key];
      }
    };
    for (const key in init) {
      copyKey(key);
    }
    INIT_KEYS.forEach((key) => {
      if (key in init) {
        copyKey(key);
      }
    });
  }

  copy.signal = signal;
  return copy;
};

// DOMException ABORT_ERR and TIMEOUT_ERR legacy codes
const isAbortShaped = (reason: unknown): boolean =>
  isAbortError(reason) ||
  isTimeoutError(reason) ||
  (isObject(reason) && ((reason as { code?: unknown }).code === 20 || (reason as { code?: unknown }).code === 23));

// AbortSignal.any ties the body read to both signals; undefined where missing or the caller
// signal is a polyfill it refuses
const mergeSignals = (own: any, caller: unknown): any => {
  const anyOf = typeof AbortSignal !== 'undefined' && AbortSignal ? AbortSignal.any : undefined;
  if (!isFunction(anyOf)) {
    return undefined;
  }
  try {
    return anyOf.call(AbortSignal, [own, caller]);
  } catch (_e) {
    return undefined;
  }
};

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
    cancel = (reason) => controller.abort(reason);
  } else {
    const cancelSignal = createCancelSignal();
    signal = cancelSignal.signal;
    cancel = cancelSignal.cancel;
  }

  let done = false;
  let abortReason: unknown;

  const abort = (reason?: any) => {
    if (!done) {
      done = true;
      abortReason = reason;
      cancel(reason);
    }
  };

  // Detaches from caller's long-lived signal so a signal reused across fetches does not
  // accumulate listeners
  let detachSignal = () => {};
  const merged =
    originalSignal && !originalSignal.aborted && !injected ? mergeSignals(signal, originalSignal) : undefined;

  if (originalSignal) {
    if (originalSignal.aborted) {
      // Forward pre-aborted input reason immediately so a caller cancel signal cancels with
      // its own CancelError verbatim
      abort(originalSignal.reason);
    } else if (merged) {
      // covers the body read without a listener on the caller signal
      merged.addEventListener('abort', () => {
        abort(merged.reason);
      });
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

  handleCancel((reason) => abort(reason));

  // the error comes from the own abort, whatever shape the fetch implementation rejects with
  const toRejection = (reason: any) => {
    if (signal.aborted) {
      if (isCancelSignal(signal)) {
        return signal.reason;
      }
      return toCancelError(abortReason === undefined ? reason : abortReason, CancelError);
    }

    return isAbortShaped(reason) ? toCancelError(reason, CancelError) : reason;
  };

  return {
    signal: merged || signal,
    abort,
    finalize: () => detachSignal(),
    toRejection,
  };
};

// the literal name keeps a union with other Error subclasses from reducing to TypeError
type TNetworkTypeError = TypeError & { readonly name: 'TypeError' };

/**
 * Failures that a cancelable fetch or fetchLater request can reject with. A network, URL or CORS
 * failure rejects with the platform `TypeError`. The set is open, so other rejections stay possible.
 * A timeout or an abort is a cancellation, not a failure: it rejects with a CancelError, whose
 * `timedOut` is true for a timeout, and adds nothing to this set.
 */
export type TCancelableFetchFailure = TNetworkTypeError | Unlisted;

const BODY_READERS = ['arrayBuffer', 'blob', 'bytes', 'formData', 'json', 'text'];

// own readers shadow the prototype ones, so canceling a read aborts the body
const wrapBodyReaders = (response: any, cancellation: IFetchCancellation): boolean => {
  if (!isObject(response) || !Object.isExtensible(response)) {
    return false;
  }

  let wrapped = false;

  BODY_READERS.forEach((name) => {
    const read = response[name];
    if (!isFunction(read)) {
      return;
    }

    Object.defineProperty(response, name, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: function (this: any) {
        return new CancelablePromise<any, TCancelableFetchFailure>((resolve, reject, { handleCancel }) => {
          handleCancel((reason) => cancellation.abort(reason));

          let pending: unknown;
          try {
            pending = read.call(this);
          } catch (error) {
            cancellation.finalize();
            reject(error);
            return;
          }

          CancelablePromise.resolve(pending).then(
            (value) => {
              cancellation.finalize();
              resolve(value);
            },
            (reason) => {
              cancellation.finalize();
              reject(cancellation.toRejection(reason));
            },
          );
        });
      },
    });
    wrapped = true;
  });

  return wrapped;
};

export const cancelableFetchFactory = (config: ICancelableFetchConfig = {}) => {
  return function cancelableFetch(input: any, init?: any): CancelablePromise<any, TCancelableFetchFailure> {
    let bodyCancellation: IFetchCancellation | undefined;

    const promise = new CancelablePromise<any, TCancelableFetchFailure>((resolve, reject, { handleCancel }) => {
      const _fetch = resolveDep<Fetch>(config, 'fetch', typeof fetch !== 'undefined' ? fetch : (undefined as any));
      const cancellation = setupCancellation(config, input, init, handleCancel);

      _fetch(input, copyInit(init, cancellation.signal)).then(
        (response: any) => {
          if (wrapBodyReaders(response, cancellation)) {
            // the caller signal stays wired until the body read settles
            bodyCancellation = cancellation;
          } else {
            cancellation.finalize();
          }
          resolve(response);
        },
        (reason: any) => {
          cancellation.finalize();
          reject(cancellation.toRejection(reason));
        },
      );
    });

    // a settled promise ignores cancel(), this one still has a body read to stop
    Object.defineProperty(promise, 'cancel', {
      configurable: true,
      enumerable: false,
      writable: true,
      value: function (this: CancelablePromise<any, any>, reason?: any, _disposing?: boolean) {
        if (bodyCancellation) {
          bodyCancellation.abort(reason);
        }
        return CancelablePromise.prototype.cancel.call(this, reason, _disposing);
      },
    });

    return promise;
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

  const { signal, finalize, toRejection } = setupCancellation(config, input, init, handleCancel);
  handleCancel(finalize);

  let result: IFetchLaterResultLike;
  try {
    // A sync throw (quota/range/type) surfaces as a raw rejection, not a CancelError.
    result = _fetchLater(input, copyInit(init, signal));
  } catch (error) {
    finalize();
    // a platform fetchLater throws an AbortError for a pre-aborted signal
    reject(signal.aborted ? toRejection(error) : error);
    return;
  }

  setResult(result);

  let stopPolling = () => {};
  handleCancel(() => stopPolling());

  // an external abort has no cancel() behind it, so it settles the promise itself
  const onAbort = () => {
    stopPolling();
    finalize();
    reject(toRejection(undefined));
  };
  if (signal.aborted) {
    onAbort();
    return;
  }
  if (isFunction(signal.addEventListener)) {
    signal.addEventListener('abort', onAbort);
  }

  const activateAfter = init?.activateAfter;

  if (typeof activateAfter !== 'number') {
    // Without activateAfter the real send happens at page-end so the promise stays pending
    // until cancel
    return;
  }

  const pollInterval = typeof config.pollInterval === 'number' ? config.pollInterval : DEFAULT_POLL_INTERVAL;
  const timers = resolveTimers(undefined, config);

  let timerHandle: any;
  stopPolling = () => {
    stopPolling = () => {};
    stopTimer(timerHandle, timers);
  };

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
