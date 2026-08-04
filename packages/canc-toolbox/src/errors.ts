import {
  _AbortError,
  _createCatchError,
  _createSuppressError,
  _isAbortError,
  _isAbortLike,
  _isTimeoutError,
  _isTimeoutLike,
  _TimeoutError,
} from '@cancjs/promise';

/**
 * AbortError class re-exported from `@cancjs/promise`.
 */
export const AbortError: typeof _AbortError = _AbortError;

/**
 * Type guard for AbortError.
 */
export const isAbortError = _isAbortError;

/**
 * TimeoutError class re-exported from `@cancjs/promise`.
 */
export const TimeoutError: typeof _TimeoutError = _TimeoutError;

/**
 * Type guard for TimeoutError.
 */
export const isTimeoutError = _isTimeoutError;

/**
 * Mints an error-catching helper function given error matchers.
 */
export const createCatchError = _createCatchError;

/**
 * Mints an error-suppressing helper function given error matchers.
 */
export const createSuppressError = _createSuppressError;

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
