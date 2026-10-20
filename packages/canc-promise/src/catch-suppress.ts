import { isAbortError, isCancelable, isFunction, isObject, isTimeoutError, readProp } from '../../_util';
import type { TErrorPredicate } from '../../_util/error-matchers';
import { CancelablePromise, type TOnCancel } from './cancelable-promise';
import type { ICatchSuppressOptions } from './helpers';

export interface IErrorMatchDeps {
  /** The error kinds this helper catches before any option widening. */
  matches: TErrorPredicate;
  /**
   * Brand check for our own CancelError. Passed in rather than imported: it is declared in
   * helpers.ts beside the brand it reads, and importing it here would close a module cycle.
   */
  isCancelError: TErrorPredicate;
  /** When false, option flags (abort/timeout) are ignored entirely. */
  flagsEnabled: boolean;
}

export const isAbortLike =
  (isCancelError: TErrorPredicate) =>
  (error: any): boolean =>
    isAbortError(error) || (isCancelError(error) && readProp(error, 'aborted') === true);

export const isTimeoutLike =
  (isCancelError: TErrorPredicate) =>
  (error: any): boolean =>
    isTimeoutError(error) || (isCancelError(error) && readProp(error, 'timedOut') === true);

function makeIsCaught({ matches, isCancelError, flagsEnabled }: IErrorMatchDeps) {
  const abortLike = isAbortLike(isCancelError);
  const timeoutLike = isTimeoutLike(isCancelError);

  return (error: any, options?: ICatchSuppressOptions): boolean => {
    if (flagsEnabled && !options?.timeout && isCancelError(error) && timeoutLike(error)) {
      return false;
    }

    return (
      matches(error) ||
      Boolean(flagsEnabled && options?.abort && abortLike(error)) ||
      Boolean(flagsEnabled && options?.timeout && timeoutLike(error))
    );
  };
}

// A value whose `then` read throws is a raw error to match, not a thenable to wait on
const isReadableThenable = (value: any): value is PromiseLike<any> =>
  (isObject(value) || isFunction(value)) && isFunction(readProp(value, 'then'));

interface ICountedSource {
  _subscribe(onFulfilled: (value: any) => unknown, onRejected: (reason: any) => unknown): void;
  _retainRef(): (() => void) | undefined;
}

const isCountedSource = (value: any): value is ICountedSource =>
  isFunction(readProp(value, '_subscribe')) && isFunction(readProp(value, '_retainRef'));

/**
 * Settle a wrapper from `source` and, when the wrapper is canceled, release the wrapper's interest
 * in it. A canc source gets one counted consumer ref, so it is canceled only when the wrapper was
 * its last consumer. A duck cancelable (third party, lazy) cannot be counted: it is canceled
 * directly, which is correct only while the wrapper is its sole holder.
 */
export function followSource(
  source: PromiseLike<any>,
  onFulfilled: (value: any) => unknown,
  onRejected: (reason: any) => unknown,
  handleCancel: ((onCancel: TOnCancel) => unknown) | undefined,
): void {
  if (isCountedSource(source)) {
    // the public `then` would add a consumer this ref could never release
    source._subscribe(onFulfilled, onRejected);
    const release = source._retainRef();

    if (handleCancel && release) {
      handleCancel(release);
    }
  } else {
    CancelablePromise.resolve(source).then(onFulfilled, onRejected);

    if (handleCancel && isCancelable(source)) {
      handleCancel((reason?: any) => source.cancel(reason));
    }
  }
}

/**
 * Release `source` for a wrapper born canceled by a pre-aborted signal: its executor never ran,
 * so the link `followSource` would have made is made and dropped here.
 */
export function releaseUnlinkedSource(source: PromiseLike<any>): void {
  const ignore = (): void => {};
  followSource(source, ignore, ignore, (release) => release());
}

// The original rejection rides along as `cause` unless the predicate error already has one
function attachCause(predicateError: unknown, original: unknown): void {
  if (!isObject(predicateError)) {
    return;
  }

  try {
    if (!('cause' in (predicateError as object))) {
      Object.defineProperty(predicateError, 'cause', { value: original, configurable: true, writable: true });
    }
  } catch {
    // frozen or hostile, the predicate error still rejects as is
  }
}

// a throwing predicate rejects the wrapper, never leaves it pending and unhandled
function settleMatched(isCaught: () => boolean, error: any, onCaught: () => void, reject: (reason: any) => void): void {
  let caught: boolean;

  try {
    caught = isCaught();
  } catch (predicateError) {
    attachCause(predicateError, error);
    reject(predicateError);
    return;
  }

  if (caught) {
    onCaught();
  } else {
    reject(error);
  }
}

/**
 * Build a catch helper: a matched rejection resolves with the error, anything else keeps
 * rejecting. Raw errors go through the same predicate and are returned or rethrown.
 */
export function makeCatch(deps: IErrorMatchDeps) {
  const isCaught = makeIsCaught(deps);

  return function catchError(errorOrPromise: any, options?: ICatchSuppressOptions): any {
    // todo: duck-check via isReadableThenable (not `instanceof CancelablePromise`) so foreign
    // thenables, a plain native Promise, a different @cancjs/promise copy (dual-package hazard),
    // another cancelable implementation — are also handled instead of falling through to the
    // error branch (where they'd previously throw synchronously since a promise is never a
    // CancelError). CancelablePromise.resolve(...) wraps/adopts the foreign thenable so .catch()
    // works uniformly regardless of what actually produced it. Any promise can reject with a
    // CancelError (not just ones created via cancel()), so this must be recognized here too.
    if (isReadableThenable(errorOrPromise)) {
      let linked = false;
      const wrapper = new CancelablePromise((resolve, reject, ctx) => {
        linked = true;
        followSource(
          errorOrPromise,
          resolve,
          (error: any) => {
            settleMatched(
              () => isCaught(error, options),
              error,
              () => resolve(error),
              reject,
            );
          },
          ctx?.handleCancel,
        );
      }, options);

      if (!linked) {
        releaseUnlinkedSource(errorOrPromise);
      }

      return wrapper;
    } else if (isCaught(errorOrPromise, options)) {
      return errorOrPromise;
    } else {
      throw errorOrPromise;
    }
  };
}

/**
 * Build a suppress helper: a matched rejection resolves with undefined, anything else keeps
 * rejecting. Raw errors go through the same predicate and are swallowed or rethrown.
 */
export function makeSuppress(deps: IErrorMatchDeps) {
  const isCaught = makeIsCaught(deps);

  return function suppressError(errorOrPromise: any, options?: ICatchSuppressOptions): any {
    // Same isReadableThenable widening as makeCatch above, see that comment.
    // Any thenable
    // (native Promise, foreign cancelable, other @cancjs/promise copy) rejecting with a
    // CancelError gets suppressed, not just CancelablePromise instances.
    if (isReadableThenable(errorOrPromise)) {
      let linked = false;
      const wrapper = new CancelablePromise((resolve, reject, ctx) => {
        linked = true;
        followSource(
          errorOrPromise,
          resolve,
          (error: any) => {
            settleMatched(
              () => isCaught(error, options),
              error,
              () => resolve(undefined),
              reject,
            );
          },
          ctx?.handleCancel,
        );
      }, options);

      if (!linked) {
        releaseUnlinkedSource(errorOrPromise);
      }

      return wrapper;
    } else if (!isCaught(errorOrPromise, options)) {
      throw errorOrPromise;
    }
  };
}
