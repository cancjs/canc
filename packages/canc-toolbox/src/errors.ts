import { _createCatchError, _createSuppressError, _isAbortLike, _isTimeoutLike } from '@cancjs/promise';

export type { ICatchErrorFn, ISuppressErrorFn } from '@cancjs/promise';
export {
  _AbortError as AbortError,
  _createCatchError as createCatchError,
  _createSuppressError as createSuppressError,
  _isAbortError as isAbortError,
  _isTimeoutError as isTimeoutError,
  _TimeoutError as TimeoutError,
} from '@cancjs/promise';

/**
 * Catch abort errors only. Matches an abort only, and an ordinary cancellation is rethrown.
 * To swallow a cancellation as well, use `catchCancel(promise, { abort: true })` from `@cancjs/promise`.
 */
export const catchAbort = _createCatchError(_isAbortLike);

/**
 * Suppress abort errors only. Matches an abort only, and an ordinary cancellation is rethrown.
 * To swallow a cancellation as well, use `suppressCancel(promise, { abort: true })` from `@cancjs/promise`.
 */
export const suppressAbort = _createSuppressError(_isAbortLike);

/**
 * Catch timeout errors only. Matches a timeout only, and an ordinary cancellation is rethrown.
 * To swallow a cancellation as well, use `catchCancel(promise, { timeout: true })` from `@cancjs/promise`.
 */
export const catchTimeout = _createCatchError(_isTimeoutLike);

/**
 * Suppress timeout errors only. Matches a timeout only, and an ordinary cancellation is rethrown.
 * To swallow a cancellation as well, use `suppressCancel(promise, { timeout: true })` from `@cancjs/promise`.
 */
export const suppressTimeout = _createSuppressError(_isTimeoutLike);
