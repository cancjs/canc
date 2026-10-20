import { readProp } from '../_util';
import { TPromiseCtor } from './construct';
import { ICancelableLike, isCancelableLike, isFunction, isObjectLike, isThunk } from './guards';
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

/** Gives up a helper's interest in an input it did not create. */
export type TReleaseInput = (reason?: any) => void;

// the private consumer-counting surface every canc promise copy exposes
interface ICountedInput {
  _subscribe(onFulfilled?: ((value: any) => unknown) | null, onRejected?: ((reason: any) => unknown) | null): void;
  _retainRef(): (() => void) | undefined;
}

const ignore = (): void => undefined;

/** Whether `value` is a canc promise that counts its consumers. A throwing getter means it is not. */
export function isCountedInput(value: unknown): value is ICountedInput {
  return isObjectLike(value) && isFunction(readProp(value, '_subscribe')) && isFunction(readProp(value, '_retainRef'));
}

/**
 * Settle from an input the helper did not create, and return the function that gives the helper's
 * interest in it up again. A canc promise is followed through one counted consumer ref, so releasing
 * it cancels the input only when no other consumer is left. Any other cancelable cannot be counted:
 * releasing it cancels it directly, which is correct only while the helper is its sole holder.
 * Anything else is only observed, and releasing it does nothing.
 *
 * Without `Impl` the input must be a thenable, and its own `then` is called.
 */
export function followInput<T>(
  input: T | PromiseLike<T>,
  onFulfilled: (value: T) => void,
  onRejected: (reason: any) => void,
  Impl?: TPromiseCtor,
): TReleaseInput {
  if (isCountedInput(input)) {
    // the public `then` would add a consumer this ref could never release
    input._subscribe(onFulfilled, onRejected);
    const release = input._retainRef();

    return release ? () => release() : ignore;
  }

  (Impl ? Impl.resolve(input) : (input as PromiseLike<T>)).then(onFulfilled, onRejected);

  return isCancelableLike(input) ? (reason?: any) => input.cancel(reason) : ignore;
}

/**
 * Watch an input for a rejection without becoming one of its consumers, so a canc promise is not
 * kept alive by the watch alone.
 */
export function observeRejection(input: PromiseLike<unknown>, onRejected: (reason: any) => void): void {
  if (isCountedInput(input)) {
    input._subscribe(undefined, onRejected);
  } else {
    input.then(undefined, onRejected);
  }
}
