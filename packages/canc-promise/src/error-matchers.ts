import type {
  MatchedError,
  MatchedOf,
  SubtractedError,
  SubtractedOf,
  TErrorConstructor,
  TErrorMatcher,
  TErrorPredicate,
} from '../../_util/error-matchers';
import { compileErrorMatchers } from '../../_util/error-matchers';
import type { CancelablePromise, ICancelablePromiseOptions } from './cancelable-promise';
import { makeCatch, makeSuppress } from './catch-suppress';
import { _isAbortLike, _isTimeoutLike, isCancelError } from './helpers';

export type {
  MatchedError,
  MatchedOf,
  SubtractedError,
  SubtractedOf,
  TErrorConstructor,
  TErrorMatcher,
  TErrorPredicate,
};

/**
 * What `createSuppressError` produces: the call shape of `suppressCancel`, with the matcher list
 * deciding what counts as caught.
 */
export interface ISuppressErrorFn<M extends readonly TErrorMatcher[] = readonly TErrorMatcher[]> {
  <TResult, TFailure>(
    promise: CancelablePromise<TResult, TFailure>,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<TResult | void, Exclude<TFailure, SubtractedOf<M>>>;
  <TResult>(
    promise: PromiseLike<TResult>,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<TResult | void, never>;
  <TError>(error: TError, options?: ICancelablePromiseOptions): void | never;
}

/**
 * What `createCatchError` produces: the call shape of `catchCancel`, with the matcher list deciding
 * what counts as caught.
 */
export interface ICatchErrorFn<M extends readonly TErrorMatcher[] = readonly TErrorMatcher[]> {
  <TResult, TFailure>(
    promise: CancelablePromise<TResult, TFailure>,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<TResult | MatchedOf<M>, Exclude<TFailure, SubtractedOf<M>>>;
  <TResult>(
    promise: PromiseLike<TResult>,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<TResult | MatchedOf<M>, never>;
  <TError>(error: TError, options?: ICancelablePromiseOptions): Extract<TError, MatchedOf<M>> | never;
}

/**
 * Build a `suppressCancel` for a chosen set of error kinds. A matched rejection resolves with
 * undefined, anything else keeps rejecting; a matched raw error is swallowed, anything else is
 * rethrown. The `abort` and `timeout` options widen the match exactly as they do on `suppressCancel`.
 *
 * A matcher is an error name, an error constructor (matched by instance, by registry brand, or by
 * name, so a second copy of the class and a foreign error of the same kind both match), or a
 * predicate. Matchers are compiled once, here, not on every call.
 *
 * @example
 * const suppressExpected = createSuppressError(CancelError, isAbortError, 'RetryError');
 * await suppressExpected(loadUser());
 */
export function createSuppressError<M extends readonly TErrorMatcher[]>(...matchers: M): ISuppressErrorFn<M> {
  return makeSuppress({
    matches: compileErrorMatchers(matchers as unknown as TErrorMatcher[], 'createSuppressError'),
    isCancelError,
    flagsEnabled: false,
  }) as unknown as ISuppressErrorFn<M>;
}

/**
 * Same as `createSuppressError`, except a matched error is handed back rather than dropped: a
 * matched rejection resolves WITH the error, and a matched raw error is returned.
 *
 * @example
 * const catchExpected = createCatchError(CancelError, 'RetryError');
 * const result = await catchExpected(loadUser());
 */
export function createCatchError<M extends readonly TErrorMatcher[]>(...matchers: M): ICatchErrorFn<M> {
  return makeCatch({
    matches: compileErrorMatchers(matchers as unknown as TErrorMatcher[], 'createCatchError'),
    isCancelError,
    flagsEnabled: false,
  }) as unknown as ICatchErrorFn<M>;
}

/**
 * @deprecated Use `createCatchError` and `createSuppressError`. These are the names the same two
 * factories carried in 1.0.0, kept as aliases.
 */
export { createCatchError as _createCatchError, createSuppressError as _createSuppressError };

/**
 * A type guard for error objects, given a list of matchers (error names, constructors, or
 * predicates). Narrows an unknown error to the union of types matched by the list.
 */
export function createIsError<M extends readonly TErrorMatcher[]>(
  ...matchers: M
): (error: unknown) => error is MatchedOf<M> {
  if (matchers.length === 0) {
    throw new TypeError('createIsError requires at least one error matcher');
  }
  return compileErrorMatchers(matchers as unknown as TErrorMatcher[], 'createIsError') as (
    error: unknown,
  ) => error is MatchedOf<M>;
}

export function catchErrors<TResult, TFailure, M extends readonly TErrorMatcher[]>(
  promise: CancelablePromise<TResult, TFailure>,
  ...matchers: M
): CancelablePromise<TResult | MatchedOf<M>, Exclude<TFailure, SubtractedOf<M>>>;
export function catchErrors<TResult, M extends readonly TErrorMatcher[]>(
  promise: PromiseLike<TResult>,
  ...matchers: M
): CancelablePromise<TResult | MatchedOf<M>, never>;
export function catchErrors<M extends readonly TErrorMatcher[]>(
  error: unknown,
  ...matchers: M
): asserts error is MatchedOf<M>;
export function catchErrors(errorOrPromise: any, ...matchers: TErrorMatcher[]): any {
  return makeCatch({
    matches: compileErrorMatchers(matchers, 'catchErrors'),
    isCancelError,
    flagsEnabled: false,
  })(errorOrPromise);
}

export function suppressErrors<TResult, TFailure, M extends readonly TErrorMatcher[]>(
  promise: CancelablePromise<TResult, TFailure>,
  ...matchers: M
): CancelablePromise<TResult | void, Exclude<TFailure, SubtractedOf<M>>>;
export function suppressErrors<TResult, M extends readonly TErrorMatcher[]>(
  promise: PromiseLike<TResult>,
  ...matchers: M
): CancelablePromise<TResult | void, never>;
export function suppressErrors<M extends readonly TErrorMatcher[]>(
  error: unknown,
  ...matchers: M
): asserts error is MatchedOf<M>;
export function suppressErrors(errorOrPromise: any, ...matchers: TErrorMatcher[]): any {
  return makeSuppress({
    matches: compileErrorMatchers(matchers, 'suppressErrors'),
    isCancelError,
    flagsEnabled: false,
  })(errorOrPromise);
}

export function isErrorOf<M extends readonly TErrorMatcher[]>(error: unknown, ...matchers: M): error is MatchedOf<M> {
  return compileErrorMatchers(matchers as unknown as TErrorMatcher[], 'isErrorOf')(error);
}

/**
 * Catch abort errors only. Matches an abort only, and an ordinary cancellation is rethrown.
 * To swallow a cancellation as well, use `catchCancel(promise, { abort: true })` from `@cancjs/promise`.
 */
export const catchAbort = createCatchError(_isAbortLike);

/**
 * Suppress abort errors only. Matches an abort only, and an ordinary cancellation is rethrown.
 * To swallow a cancellation as well, use `suppressCancel(promise, { abort: true })` from `@cancjs/promise`.
 */
export const suppressAbort = createSuppressError(_isAbortLike);

/**
 * Catch timeout errors only. Matches a timeout only, and an ordinary cancellation is rethrown.
 * To swallow a cancellation as well, use `catchCancel(promise, { timeout: true })` from `@cancjs/promise`.
 */
export const catchTimeout = createCatchError(_isTimeoutLike);

/**
 * Suppress timeout errors only. Matches a timeout only, and an ordinary cancellation is rethrown.
 * To swallow a cancellation as well, use `suppressCancel(promise, { timeout: true })` from `@cancjs/promise`.
 */
export const suppressTimeout = createSuppressError(_isTimeoutLike);
