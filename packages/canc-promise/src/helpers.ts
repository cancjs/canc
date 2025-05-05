import { CancelError } from './cancel-error';
import { CancelablePromise, ICancelablePromiseOptions, ICancelRef } from './cancelable-promise';
import { isCancelable, isObject } from '../../_util';

export const isCancelError = (error: any): error is CancelError => isObject(error) && typeof error.message === 'string' && error.name === 'CancelError';

export function createCancelRef(): ICancelRef {
  return { cancel: null };
}

export function createAbortSignal() {
  const controller = new AbortController();

  return {
    abort: controller.abort.bind(controller),
    signal: controller.signal
  };
}

export function catchCancel<TResult extends any>(promise: CancelablePromise<TResult>): CancelablePromise<TResult | CancelError>;
export function catchCancel<TError extends any>(error: TError): CancelError | never;
export function catchCancel<TResult extends any, TError extends any>(errorOrPromise: CancelablePromise<TResult> | TError): CancelablePromise<TResult | CancelError> | CancelError | never {
  if (errorOrPromise instanceof CancelablePromise) {
    return (errorOrPromise as CancelablePromise<TResult>)
      .catch((error: any) => {
        if (isCancelError(error)) {
          return error as CancelError;
        } else {
            throw error;
        }
      });
  } else if (isCancelError(errorOrPromise)) {
    return errorOrPromise as CancelError;
  } else {
    throw errorOrPromise;
  }
}

export function suppressCancel<TResult extends any>(promise: CancelablePromise<TResult>): CancelablePromise<TResult | void>;
export function suppressCancel<TError extends any>(error: TError): void | never;
export function suppressCancel<TResult extends any, TError extends any>(errorOrPromise: CancelablePromise<TResult> | TError): CancelablePromise<TResult | void> | void | never {
  if (errorOrPromise instanceof CancelablePromise) {
    return (errorOrPromise as CancelablePromise<TResult | void>)
      .catch((error: any) => {
        if (!isCancelError(error)) {
          throw error;
        }
      });
  } else if (!isCancelError(errorOrPromise)) {
    throw errorOrPromise;
  }
}
var s = suppressCancel(CancelablePromise.resolve(4))
export function forceCancelable<T>(promise: PromiseLike<T>, options?: ICancelablePromiseOptions): CancelablePromise<T> {
  return new CancelablePromise(
    (resolve, reject, handleCancel) => {
      promise.then(resolve, reject);

      if (isCancelable(promise)) {
        handleCancel((reason?: any) => {
          promise.cancel(reason);
        });
      }
    },
    options
  );
}
