import type { TErrorConstructor, TErrorMatcher, TErrorPredicate } from '../../_util/error-matchers';
import { compileErrorMatchers } from '../../_util/error-matchers';
import type { CancelablePromise } from './cancelable-promise';
import { makeCatch, makeSuppress } from './catch-suppress';
import { ICatchSuppressOptions, isCancelError } from './helpers';

export type { TErrorConstructor, TErrorMatcher, TErrorPredicate };

/**
 * What `createSuppressError` produces: the call shape of `suppressCancel`, with the matcher list
 * deciding what counts as caught.
 */
export interface ISuppressErrorFn {
  <TResult>(promise: PromiseLike<TResult>, options?: ICatchSuppressOptions): CancelablePromise<TResult | void>;
  <TError>(error: TError, options?: ICatchSuppressOptions): void | never;
}

/**
 * What `createCatchError` produces: the call shape of `catchCancel`, with the matcher list deciding
 * what counts as caught.
 */
export interface ICatchErrorFn {
  <TResult>(promise: PromiseLike<TResult>, options?: ICatchSuppressOptions): CancelablePromise<TResult | Error>;
  <TError>(error: TError, options?: ICatchSuppressOptions): TError | never;
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
export function createSuppressError(...matchers: TErrorMatcher[]): ISuppressErrorFn {
  return makeSuppress({
    matches: compileErrorMatchers(matchers, 'createSuppressError'),
    isCancelError,
  }) as ISuppressErrorFn;
}

/**
 * Same as `createSuppressError`, except a matched error is handed back rather than dropped: a
 * matched rejection resolves WITH the error, and a matched raw error is returned.
 *
 * @example
 * const catchExpected = createCatchError(CancelError, 'RetryError');
 * const result = await catchExpected(loadUser());
 */
export function createCatchError(...matchers: TErrorMatcher[]): ICatchErrorFn {
  return makeCatch({
    matches: compileErrorMatchers(matchers, 'createCatchError'),
    isCancelError,
  }) as ICatchErrorFn;
}
