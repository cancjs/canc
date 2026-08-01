import { ICancelableLike, isCancelableLike, isThunk } from './guards';

/**
 * What a time helper accepts in place of a value: the value itself, a promise of it, or a thunk
 * that produces either. The three helpers share the type and differ only in WHEN they call a thunk.
 */
export type TTimedInput<T> = T | PromiseLike<T> | (() => T | PromiseLike<T>);

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
export function startInput<T>(input: TTimedInput<T>): IEagerSource<T> {
  const source = isThunk<T>(input) ? input() : (input as T | PromiseLike<T>);

  return { source, cancelable: isCancelableLike(source) ? source : undefined };
}
