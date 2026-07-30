import { isCancelable, isObject, isThenable } from '../../_util';
import { CANCEL_ERROR_BRAND, CancelError } from './cancel-error';
import { CANCEL_PROMISE_BRAND, CancelablePromise, ICancelableHelperOptions } from './cancelable-promise';

// Brand check: a foreign error merely named 'CancelError' is NOT matched, only objects carrying
// the shared Symbol.for brand set by the CancelError constructor. Cross-realm/cross-copy safe
// because the brand comes from the global symbol registry.
export const isCancelError = (error: any): error is CancelError =>
  isObject(error) && error[CANCEL_ERROR_BRAND] === true;

// Brand check: same rationale as isCancelError, but for CancelablePromise instances. Duck-types
// via CANCEL_PROMISE_BRAND (set on the prototype at module load) instead of `instanceof
// CancelablePromise`, so a different @cancjs/promise copy (dual-package hazard) is still
// recognized.
export const isCancPromise = (value: any): value is CancelablePromise<any> =>
  isObject(value) && value[CANCEL_PROMISE_BRAND] === true;

// AbortController/AbortSignal reject with a DOMException whose name is 'AbortError'. There is no
// brand to key on (it is a platform error, not ours), so detection matches the name, the same
// convention every AbortSignal consumer uses. Works for a real DOMException and for a plain Error
// stand-in in runtimes without DOMException.
// Duplicated (not imported) from canc-toolbox's abort.ts: toolbox depends on this package, so a
// reverse import here would be a cycle. Keep both in sync if the name-check logic ever changes.
export const isAbortError = (error: any): boolean =>
  isObject(error) && (error as { name?: unknown }).name === 'AbortError';

// Agent-wide brand marking a "cancel signal": an AbortSignal that aborts with a CancelError.
// Same Symbol.for-registry rationale as CANCEL_ERROR_BRAND, cross-realm/cross-copy safe.
export const CANCEL_SIGNAL_BRAND = Symbol.for('@cancjs/promise:cancel signal');

// A cancel signal is a native AbortSignal branded to mark that it aborts with a CancelError. The
// brand is an own, non-enumerable property carrying the registry symbol.
export type CancelSignal = AbortSignal & { readonly [CANCEL_SIGNAL_BRAND]: true };

// Brand check: a plain AbortSignal (raw AbortController) is NOT a cancel signal, only a signal
// produced by createCancelSignal carries the brand.
export const isCancelSignal = (value: any): value is CancelSignal =>
  isObject(value) && value[CANCEL_SIGNAL_BRAND] === true;

export function createCancelSignal(reason?: any) {
  const controller = new AbortController();

  // Brand the signal so isCancelSignal recognizes it: this signal aborts with a CancelError, not
  // a raw DOMException.
  Object.defineProperty(controller.signal, CANCEL_SIGNAL_BRAND, { value: true });

  return {
    // The bound cancel mints a branded CancelError as the signal reason (unless it is already a
    // CancelError, which passes through). Aborting this signal therefore reads as a genuine
    // cancellation: spec-compliant consumers (e.g. fetch, which rejects with signal.reason)
    // reject with our CancelError directly, and a {signal}-option promise cancels with that exact
    // error. Normalization mirrors cancel(): a string/undefined becomes the message, any other
    // object becomes the cause.
    cancel: (r: any = reason) =>
      controller.abort(
        isCancelError(r) ? r
        : isObject(r) ? new CancelError(undefined, { cause: r })
        : new CancelError(r),
      ),
    signal: controller.signal as CancelSignal,
  };
}

export interface ICatchSuppressOptions {
  /**
   * Also match a plain AbortSignal-driven abort: a raw AbortError, or a CancelError whose
   * `aborted` getter is true (its cause is an AbortError). Default false: only a genuine
   * CancelError is matched.
   */
  abort?: boolean;
}

function isCaught(error: any, options?: ICatchSuppressOptions): boolean {
  return (
    isCancelError(error) || Boolean(options?.abort && (isAbortError(error) || (isCancelError(error) && error.aborted)))
  );
}

export function catchCancel<TResult extends any>(
  promise: PromiseLike<TResult>,
  options?: ICatchSuppressOptions,
): CancelablePromise<TResult | CancelError>;
export function catchCancel<TError extends any>(
  error: TError,
  options?: ICatchSuppressOptions,
): CancelError | TError | never;
export function catchCancel<TResult extends any, TError extends any>(
  errorOrPromise: PromiseLike<TResult> | TError,
  options?: ICatchSuppressOptions,
): CancelablePromise<TResult | CancelError> | CancelError | TError | never {
  // todo: duck-check via isThenable (not `instanceof CancelablePromise`) so foreign
  // thenables, a plain native Promise, a different @cancjs/promise copy (dual-package hazard),
  // another cancelable implementation — are also handled instead of falling through to the
  // error branch (where they'd previously throw synchronously since a promise is never a
  // CancelError). CancelablePromise.resolve(...) wraps/adopts the foreign thenable so .catch()
  // works uniformly regardless of what actually produced it. Any promise can reject with a
  // CancelError (not just ones created via cancel()), so this must be recognized here too.
  if (isThenable(errorOrPromise)) {
    return CancelablePromise.resolve(errorOrPromise as PromiseLike<TResult>).catch((error: any) => {
      if (isCaught(error, options)) {
        return error;
      } else {
        throw error;
      }
    });
  } else if (isCaught(errorOrPromise, options)) {
    return errorOrPromise as CancelError | TError;
  } else {
    throw errorOrPromise;
  }
}

export function suppressCancel<TResult extends any>(
  promise: PromiseLike<TResult>,
  options?: ICatchSuppressOptions,
): CancelablePromise<TResult | void>;
export function suppressCancel<TError extends any>(error: TError, options?: ICatchSuppressOptions): void | never;
export function suppressCancel<TResult extends any, TError extends any>(
  errorOrPromise: PromiseLike<TResult> | TError,
  options?: ICatchSuppressOptions,
): CancelablePromise<TResult | void> | void | never {
  // todo: same isThenable widening as catchCancel above, see that comment. Any thenable
  // (native Promise, foreign cancelable, other @cancjs/promise copy) rejecting with a CancelError
  // gets suppressed, not just CancelablePromise instances.
  if (isThenable(errorOrPromise)) {
    return CancelablePromise.resolve(errorOrPromise as PromiseLike<TResult>).catch((error: any) => {
      if (!isCaught(error, options)) {
        throw error;
      }
    });
  } else if (!isCaught(errorOrPromise, options)) {
    throw errorOrPromise;
  }
}

// Renamed from forceCancelable: that name collided with the unrelated `forceCancelable` option
// on ICancelablePromiseFlagOptions (this function wraps a promise into a cancelable one; the
// option keeps a promise cancelable when a native promise is adopted through resolve()).
export function makeCancelable<T>(promise: PromiseLike<T>, options?: ICancelableHelperOptions): CancelablePromise<T> {
  const This = options?.CancelablePromise || CancelablePromise;

  return new This((resolve, reject, { handleCancel }) => {
    promise.then(resolve, reject);

    if (isCancelable(promise)) {
      handleCancel((reason?: any) => {
        promise.cancel(reason);
      });
    }
  }, options);
}
