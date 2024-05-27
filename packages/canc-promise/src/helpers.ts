import { CancelError, isCancelError } from './cancel-error';
import { CancelablePromise, ICancelRef, TCancelablePromiseOptions } from './cancelable-promise';
import { isCancelable } from '../../_util';

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

export function forceCancelable<T>(promise: PromiseLike<T>, options?: TCancelablePromiseOptions): CancelablePromise<T> {
  return new CancelablePromise(
    (resolve, _reject, handleCancel) => {
      handleCancel((reason?: any) => {
        if (isCancelable(promise)) {
          promise.cancel(reason);
        }
      });

      resolve(promise);
    },
    options
  );
}
