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

export function catchCancel<T extends any>(error: T): CancelError | never {
  if (isCancelError(error)) {
    return error;
  } else {
    throw error;
  }
}

export function suppressCancel<T extends any>(error: T): void | never {
  if (!isCancelError(error)) {
    throw error;
  }
}

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
