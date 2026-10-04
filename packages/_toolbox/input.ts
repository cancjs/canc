import { ICancelableLike, isCancelableLike, isThunk } from './guards';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';

/**
 * What a time helper accepts in place of a value: the value itself, a promise of it, or a thunk
 * that produces either. The three helpers share the type and differ only in WHEN they call a thunk.
 *
 * The flavor `K` is named so a promise of the bound implementation matches ahead of the bare
 * `PromiseLike` branch, which is what lets a helper read `F` off the input instead of taking it as
 * an explicit type argument. Left at the default, this is the plain input type it has always been.
 */
export type TTimedInput<T, K extends IPromiseKind = IPromiseLikeKind, F = never> =
  T | TPromiseOf<K, T, F> | PromiseLike<T> | (() => T | TPromiseOf<K, T, F> | PromiseLike<T>);

/** An input that has been started, plus the handle needed to stop it again. */
export interface IEagerSource<T> {
  source: T | PromiseLike<T>;
  /** Set when the started work can be canceled, which is what lets a deadline stop it. */
  cancelable?: ICancelableLike;
}

/**
 * Start the input of a parallel time helper (`minDelay`, `timeout`) right away, because a bound on
 * work that has not begun is not a bound on anything. Call this from inside the executor: a thunk
 * that throws then becomes a rejection of the returned promise rather than an exception out of the
 * helper itself, which is what `try` semantics mean here.
 *
 * `delay` deliberately does NOT use this. It is sequential, so its thunk runs after the timer.
 */
export function startInput<T, K extends IPromiseKind = IPromiseLikeKind, F = never>(
  input: TTimedInput<T, K, F>,
): IEagerSource<T> {
  const source = isThunk<T>(input) ? input() : (input as T | PromiseLike<T>);

  return { source, cancelable: isCancelableLike(source) ? source : undefined };
}
