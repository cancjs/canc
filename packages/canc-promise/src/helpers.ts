import {
  AbortError,
  AggregateError,
  isAbortError,
  isAggregateError,
  isCancelable,
  isObject,
  isTimeoutError,
  TimeoutError,
} from '../../_util';
import { CANCEL_ERROR_BRAND, CancelError } from './cancel-error';
import {
  CANCEL_PROMISE_BRAND,
  CancelablePromise,
  ICancelableHelperOptions,
  ICancelablePromiseOptions,
} from './cancelable-promise';
import { isAbortLike, isTimeoutLike, makeCatch, makeSuppress } from './catch-suppress';

// Brand check: a foreign error merely named 'CancelError' is NOT matched, only objects carrying
// the shared Symbol.for brand set by the CancelError constructor. Cross-realm/cross-copy safe
// because the brand comes from the global symbol registry.
export const isCancelError = (error: any): error is CancelError =>
  isObject(error) && error[CANCEL_ERROR_BRAND] === true;

/** @internal */
export const _isAbortLike = isAbortLike(isCancelError);
/** @internal */
export const _isTimeoutLike = isTimeoutLike(isCancelError);

// Brand check: same rationale as isCancelError, but for CancelablePromise instances. Duck-types
// via CANCEL_PROMISE_BRAND (set on the prototype at module load) instead of `instanceof
// CancelablePromise`, so a different @cancjs/promise copy (dual-package hazard) is still
// recognized.
export const isCancPromise = (value: any): value is CancelablePromise<any> =>
  isObject(value) && value[CANCEL_PROMISE_BRAND] === true;

export { AbortError, AggregateError, isAbortError, isAggregateError, isTimeoutError, TimeoutError };

// Agent-wide brand marking a "cancel signal": an AbortSignal that aborts with a CancelError.
// Same Symbol.for-registry rationale as CANCEL_ERROR_BRAND, cross-realm/cross-copy safe.
export const CANCEL_SIGNAL_BRAND = Symbol.for('@cancjs/promise:CancelSignal');

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

export interface ICatchSuppressOptions extends ICancelablePromiseOptions {
  /**
   * Also match a plain AbortSignal-driven abort: a raw AbortError, or a CancelError whose
   * `aborted` getter is true (its cause is an AbortError). Default false: only a genuine
   * CancelError is matched.
   */
  abort?: boolean;
  /**
   * Also match a plain timeout: a raw TimeoutError, or a CancelError whose `timedOut` getter is
   * true (its cause is a TimeoutError). Default false: only a genuine CancelError is matched.
   * Independent of `abort` - each option widens the match for its own kind only.
   */
  timeout?: boolean;
}

// One code path for both the built-in pair below and the matcher factories in error-matchers.ts:
// only the base predicate differs. Here it is the CancelError brand check.
const catchCancelImpl = makeCatch({ matches: isCancelError, isCancelError, flagsEnabled: true });
const suppressCancelImpl = makeSuppress({ matches: isCancelError, isCancelError, flagsEnabled: true });

export function catchCancel<TResult>(
  promise: PromiseLike<TResult>,
  options?: ICatchSuppressOptions,
): CancelablePromise<TResult | CancelError>;
export function catchCancel<TError>(error: TError, options?: ICatchSuppressOptions): CancelError | TError | never;
export function catchCancel<TResult, TError>(
  errorOrPromise: PromiseLike<TResult> | TError,
  options?: ICatchSuppressOptions,
): CancelablePromise<TResult | CancelError> | CancelError | TError | never {
  return catchCancelImpl(errorOrPromise, options);
}

export function suppressCancel<TResult>(
  promise: PromiseLike<TResult>,
  options?: ICatchSuppressOptions,
): CancelablePromise<TResult | void>;
export function suppressCancel<TError>(error: TError, options?: ICatchSuppressOptions): void | never;
export function suppressCancel<TResult, TError>(
  errorOrPromise: PromiseLike<TResult> | TError,
  options?: ICatchSuppressOptions,
): CancelablePromise<TResult | void> | void | never {
  return suppressCancelImpl(errorOrPromise, options);
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
