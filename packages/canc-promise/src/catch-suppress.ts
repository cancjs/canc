import { isAbortError, isCancelable, isThenable, isTimeoutError } from '../../_util';
import type { TErrorPredicate } from '../../_util/error-matchers';
import { CancelablePromise } from './cancelable-promise';
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
    isAbortError(error) || (isCancelError(error) && error.aborted === true);

export const isTimeoutLike =
  (isCancelError: TErrorPredicate) =>
  (error: any): boolean =>
    isTimeoutError(error) || (isCancelError(error) && error.timedOut === true);

function makeIsCaught({ matches, isCancelError, flagsEnabled }: IErrorMatchDeps) {
  const abortLike = isAbortLike(isCancelError);
  const timeoutLike = isTimeoutLike(isCancelError);

  return (error: any, options?: ICatchSuppressOptions): boolean =>
    matches(error) ||
    Boolean(flagsEnabled && options?.abort && abortLike(error)) ||
    Boolean(flagsEnabled && options?.timeout && timeoutLike(error));
}

/**
 * Build a catch helper: a matched rejection resolves with the error, anything else keeps
 * rejecting. Raw errors go through the same predicate and are returned or rethrown.
 */
export function makeCatch(deps: IErrorMatchDeps) {
  const isCaught = makeIsCaught(deps);

  return function catchError(errorOrPromise: any, options?: ICatchSuppressOptions): any {
    // todo: duck-check via isThenable (not `instanceof CancelablePromise`) so foreign
    // thenables, a plain native Promise, a different @cancjs/promise copy (dual-package hazard),
    // another cancelable implementation — are also handled instead of falling through to the
    // error branch (where they'd previously throw synchronously since a promise is never a
    // CancelError). CancelablePromise.resolve(...) wraps/adopts the foreign thenable so .catch()
    // works uniformly regardless of what actually produced it. Any promise can reject with a
    // CancelError (not just ones created via cancel()), so this must be recognized here too.
    if (isThenable(errorOrPromise)) {
      return new CancelablePromise((resolve, reject, ctx) => {
        CancelablePromise.resolve(errorOrPromise).then(resolve, (error: any) => {
          if (isCaught(error, options)) {
            resolve(error);
          } else {
            reject(error);
          }
        });

        if (ctx && isCancelable(errorOrPromise)) {
          ctx.handleCancel((reason?: any) => {
            errorOrPromise.cancel(reason);
          });
        }
      }, options);
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
    // todo: same isThenable widening as makeCatch above, see that comment. Any thenable
    // (native Promise, foreign cancelable, other @cancjs/promise copy) rejecting with a
    // CancelError gets suppressed, not just CancelablePromise instances.
    if (isThenable(errorOrPromise)) {
      return new CancelablePromise((resolve, reject, ctx) => {
        CancelablePromise.resolve(errorOrPromise).then(resolve, (error: any) => {
          if (!isCaught(error, options)) {
            reject(error);
          } else {
            resolve(undefined);
          }
        });

        if (ctx && isCancelable(errorOrPromise)) {
          ctx.handleCancel((reason?: any) => {
            errorOrPromise.cancel(reason);
          });
        }
      }, options);
    } else if (!isCaught(errorOrPromise, options)) {
      throw errorOrPromise;
    }
  };
}
