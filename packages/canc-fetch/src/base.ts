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

// stand-ins so the source builds without DOM or Node fetch lib types
type AbortControllerCtor = new () => { abort: (reason?: any) => void; signal: any };
type Fetch = (input: any, init?: any) => Promise<any>;

declare const fetch: Fetch;
declare const AbortController: AbortControllerCtor;
declare const AbortSignal: { any?: (signals: any[]) => any } | undefined;

export interface ICancelableFetchConfig {
  fetch?: Fetch;
  // a working one for a faulty polyfill, the reason this stays a factory
  AbortController?: AbortControllerCtor;
}

// a polyfilled signal may lack addEventListener or onabort
interface PolyfilledAbortSignal {
  aborted?: boolean;
  reason?: any;
  onabort?: ((this: any, event: any) => any) | null;
  addEventListener?: (type: string, listener: (event: any) => void) => void;
  removeEventListener?: (type: string, listener: (event: any) => void) => void;
}

// globals are read per call, so importing never touches a missing one
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
  // wires the caller signal again, for a body read still in flight
  rewire: () => void;
  toRejection: (reason: any) => any;
}

// members a class instance or a Request may hold as non-enumerable getters
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

// a spread drops inherited and getter members, a prototype POST went out as GET
const copyInit = (init: any, signal: any): any => {
  const copy: Record<string, any> = {};

  if (isObject(init)) {
    const copyKey = (key: string) => {
      // an own __proto__ from JSON.parse would reset the prototype
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

// undefined where AbortSignal.any is missing or refuses a polyfilled signal
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

  // init or a Request input may carry the caller signal
  const initSignal = (init as { signal?: unknown } | undefined)?.signal;
  const inputSignal = (input as { signal?: unknown } | undefined)?.signal;
  const originalSignal = (initSignal || inputSignal) as PolyfilledAbortSignal | null | undefined;

  // the branded cancel signal already aborts with a CancelError
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

  // a caller signal reused across fetches must not collect listeners
  let detachSignal = () => {};
  let mergedWired = false;
  const merged =
    originalSignal && !originalSignal.aborted && !injected ? mergeSignals(signal, originalSignal) : undefined;

  // wires the caller signal onto the own one, detachSignal undoes it
  const attachSignal = () => {
    if (!originalSignal) {
      return;
    }
    if (originalSignal.aborted) {
      // a caller cancel signal keeps its own CancelError
      abort(originalSignal.reason);
    } else if (merged) {
      // covers the body read without a listener on the caller signal
      if (!mergedWired) {
        mergedWired = true;
        merged.addEventListener('abort', () => {
          abort(merged.reason);
        });
      }
    } else if (isFunction(originalSignal.addEventListener)) {
      // survives onabort reassignment and leaves the caller object alone
      const externalAbortListener = () => {
        abort(originalSignal.reason);
      };
      originalSignal.addEventListener('abort', externalAbortListener);

      if (isFunction(originalSignal.removeEventListener)) {
        detachSignal = () => {
          detachSignal = () => {};
          originalSignal.removeEventListener!('abort', externalAbortListener);
        };
      }
    } else if ('onabort' in originalSignal) {
      // legacy polyfill: chain onabort, restore it on settle
      const originalOnAbort = originalSignal.onabort;

      originalSignal.onabort = function (this: any, event: any) {
        abort(originalSignal.reason);

        if (isFunction(originalOnAbort)) {
          originalOnAbort.call(this, event);
        }
      };

      detachSignal = () => {
        detachSignal = () => {};
        originalSignal.onabort = originalOnAbort ?? null;
      };
    }
  };

  attachSignal();

  handleCancel((reason) => abort(reason));

  // the own abort decides the error, whatever the implementation rejects with
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
    rewire: () => {
      if (!done) {
        detachSignal();
        attachSignal();
      }
    },
    toRejection,
  };
};

// the literal name stops other Error subclasses reducing into TypeError
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
  let reads = 0;

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

          const end = () => {
            reads -= 1;
            if (reads === 0) {
              cancellation.finalize();
            }
          };

          reads += 1;
          cancellation.rewire();

          let pending: unknown;
          try {
            pending = read.call(this);
          } catch (error) {
            end();
            reject(error);
            return;
          }

          CancelablePromise.resolve(pending).then(
            (value) => {
              end();
              resolve(value);
            },
            (reason) => {
              end();
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
          // a body read wires the caller signal again while it runs
          if (wrapBodyReaders(response, cancellation)) {
            bodyCancellation = cancellation;
          }
          cancellation.finalize();
          resolve(response);
        },
        (reason: any) => {
          cancellation.finalize();
          reject(cancellation.toRejection(reason));
        },
      );
    });

    // settled promises ignore cancel(), this one may have a body to stop
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

// local stand-in, a future built-in FetchLaterResult stays assignable
export interface IFetchLaterResultLike {
  readonly activated: boolean;
}

export type TDeferredRequestInit = Record<string, any> & { activateAfter?: number };

type FetchLater = (input: any, init?: TDeferredRequestInit) => IFetchLaterResultLike;

declare const fetchLater: FetchLater;

// an interface cannot extend the TTimersOverride union
export type ICancelableFetchLaterConfig = ICancelableFetchConfig &
  TTimersOverride & {
    fetchLater?: FetchLater;
    // ms between activated checks when activateAfter is set
    pollInterval?: number;
  };

export type TCancelableFetchLaterPromise = CancelablePromise<IFetchLaterResultLike, TCancelableFetchFailure> & {
  readonly activated: boolean | null;
};

const DEFAULT_POLL_INTERVAL = 500;

// non-enumerable so promise internals never see it
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
    // a quota, range or type throw rejects raw
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

  // no cancel() behind an external abort, so it settles the promise
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
    // sent at page end, so pending until canceled
    return;
  }

  const pollInterval = typeof config.pollInterval === 'number' ? config.pollInterval : DEFAULT_POLL_INTERVAL;
  const timers = resolveTimers(undefined, config);

  let timerHandle: any;
  stopPolling = () => {
    stopPolling = () => {};
    stopTimer(timerHandle, timers);
  };

  // recursive setTimeout: a long tick never overlaps the next one
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
