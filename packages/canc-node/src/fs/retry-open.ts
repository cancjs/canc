import { CancelablePromise } from '@cancjs/promise';

import { IRetryOptions, retryFactory } from '../../../_toolbox';
import { isCancelable, isThenable } from '../../../_util';
import { getFsOptions } from './registry';
import { toolboxDeps } from './wrap';

const retry = retryFactory(toolboxDeps);

/**
 * Default retry options for open and opendir operations when retryOpen is enabled.
 */
export const DEFAULT_OPEN_RETRY_OPTIONS: IRetryOptions = {
  retries: 8,
  minTimeout: 10,
  factor: 1.5,
  maxTimeout: 1000,
};

// retry stops early only by resolving, so a non-retriable failure travels as a tagged value
const kFatal = Symbol('canc.fs.fatal');

interface IFatal {
  [kFatal]: unknown;
}

function isFatal(value: unknown): value is IFatal {
  return typeof value === 'object' && value !== null && kFatal in value;
}

function isRetriableFsError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return code === 'EMFILE' || code === 'ENFILE';
}

/** Rethrow what is worth another attempt, and tag everything else so the loop stops at once. */
function classify(err: unknown): IFatal {
  if (isRetriableFsError(err)) {
    throw err;
  }

  return { [kFatal]: err };
}

/**
 * Retry an open or opendir operation on EMFILE and ENFILE errors when retryOpen is enabled.
 *
 * Provides a bounded retry loop with exponential backoff for promise-based handle creation.
 * Unlike callback queuing, this does not patch process-wide file closure hooks or maintain an
 * unbounded queue, but it does allow cancellation between retry attempts.
 *
 * @param operation - Factory function performing the underlying open or opendir operation.
 * @param options - Custom retry configuration options.
 */
export function retryOpen<T>(
  operation: (attempt: number) => PromiseLike<T> | T,
  options?: IRetryOptions,
): CancelablePromise<T> {
  if (!getFsOptions().retryOpen) {
    return new CancelablePromise<T>((resolve, _reject, { handleCancel }) => {
      const started = operation(1);
      if (isCancelable(started)) {
        handleCancel((reason) => started.cancel(reason));
      }
      resolve(started);
    });
  }

  const opts: IRetryOptions = {
    ...DEFAULT_OPEN_RETRY_OPTIONS,
    ...options,
  };

  const attempted = retry<T | IFatal>((attempt: number) => {
    let started: PromiseLike<T> | T;
    try {
      started = operation(attempt);
    } catch (err) {
      return classify(err);
    }

    // the underlying call already has a promise, so the classification rides that one
    return isThenable(started) ? (started as PromiseLike<T>).then(undefined, classify) : started;
  }, opts);

  // Awaited<T> and T are unrelated to the checker while T is generic
  return attempted.then((result) => {
    if (isFatal(result)) {
      throw result[kFatal];
    }

    return result;
  }) as CancelablePromise<T>;
}

/**
 * Wrap an open or opendir function with EMFILE and ENFILE retry logic.
 *
 * @param fn - The function to wrap.
 * @param options - Custom retry configuration options.
 */
export function withRetryOpen<T, A extends unknown[]>(
  fn: (...args: A) => PromiseLike<T> | T,
  options?: IRetryOptions,
): (...args: A) => CancelablePromise<T> {
  return function (...args: A): CancelablePromise<T> {
    return retryOpen(() => fn(...args), options);
  };
}
