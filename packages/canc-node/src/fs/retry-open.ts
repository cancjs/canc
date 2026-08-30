import { CancelablePromise } from '@cancjs/promise';

import { IPromiseKind, IRetryOptions, IToolboxDeps, retryFactory, TPromiseCtor } from '../../../_toolbox';
import { getFsOptions } from './registry';

interface ICancelableKind extends IPromiseKind {
  promise: CancelablePromise<this['value']>;
  options: object;
}

const deps: IToolboxDeps<ICancelableKind> = {
  Impl: CancelablePromise as unknown as TPromiseCtor,
  cancelable: true,
};

const retry = retryFactory(deps);

/**
 * Default retry options for open and opendir operations when retryOpen is enabled.
 */
export const DEFAULT_OPEN_RETRY_OPTIONS: IRetryOptions = {
  retries: 8,
  minTimeout: 10,
  factor: 1.5,
  maxTimeout: 1000,
};

function isRetriableFsError(err: any): boolean {
  return !!(err && (err.code === 'EMFILE' || err.code === 'ENFILE'));
}

/**
 * Retry an open or opendir operation on EMFILE and ENFILE errors when retryOpen is enabled.
 *
 * Provides a bounded retry loop with exponential backoff for promise-based handle creation.
 * Unlike graceful-fs callback queuing, this does not patch process-wide file closure hooks
 * or maintain an unbounded queue, but allows cancellation between retry attempts.
 *
 * @param operation - Factory function performing the underlying open or opendir operation.
 * @param options - Custom retry configuration options.
 */
export function retryOpen<T>(
  operation: (attempt: number) => PromiseLike<T> | T,
  options?: IRetryOptions,
): CancelablePromise<T> {
  if (!getFsOptions().retryOpen) {
    return new CancelablePromise<T>((resolve, reject, ctx) => {
      const result = operation(1);
      if (ctx && typeof (result as any)?.cancel === 'function') {
        ctx.handleCancel((reason) => {
          (result as any).cancel(reason);
        });
      }
      CancelablePromise.resolve(result).then(resolve, reject);
    });
  }

  const opts: IRetryOptions = {
    ...DEFAULT_OPEN_RETRY_OPTIONS,
    ...options,
  };

  const p = retry((attempt: number) => {
    return Promise.resolve()
      .then(() => operation(attempt))
      .catch((err) => {
        if (isRetriableFsError(err)) {
          throw err;
        }
        return { __cancNonRetriable: err } as any;
      });
  }, opts);

  return p.then((res: any) => {
    if (res && typeof res === 'object' && '__cancNonRetriable' in res) {
      return CancelablePromise.reject(res.__cancNonRetriable);
    }
    return res;
  });
}

/**
 * Wrap an open or opendir function with EMFILE and ENFILE retry logic.
 *
 * @param fn - The function to wrap.
 * @param options - Custom retry configuration options.
 */
export function withRetryOpen<T, A extends any[]>(
  fn: (...args: A) => PromiseLike<T> | T,
  options?: IRetryOptions,
): (...args: A) => CancelablePromise<T> {
  return function (...args: A): CancelablePromise<T> {
    return retryOpen(() => fn(...args), options);
  };
}
