import { isFunction, isThenableLike } from '../guards';
import { callbackFactory, type ICallbackDeps, type IItemRun } from './callback';
import { callReturn, getSource } from './pull';
import type { AnyIterable } from './types';

/**
 * What a callback may return in any of the four supported forms: a plain value, a thenable (an
 * async function or a cancelable-returning function), or a generator the driver steps through.
 */
export type TCallbackResult<R> = R | PromiseLike<R> | Generator<any, R, any>;

export type TIterPredicate<T> = (value: T, index: number) => TCallbackResult<unknown>;
export type TIterVisitor<T> = (value: T, index: number) => TCallbackResult<unknown>;
export type TIterReducer<T, A> = (accumulator: A, value: T, index: number) => TCallbackResult<A>;

/** Keep pulling. */
interface IContinue {
  done: false;
}

/** Stop pulling and settle the terminal with this result. */
interface IStop<R> {
  done: true;
  value: R;
}

type TStep<R> = IContinue | IStop<R>;

/** Runs one callback in whichever of the four forms it was written in. */
type TRunStep = (callback: (...args: any[]) => any, args: any[]) => PromiseLike<any>;

const CONTINUE: IContinue = { done: false };

function stopWith<R>(value: R): IStop<R> {
  return { done: true, value };
}

/** The comparison `includes` is specified with: unlike `===`, NaN matches NaN and +0 matches -0. */
function sameValueZero(a: unknown, b: unknown): boolean {
  return a === b || (a !== a && b !== b);
}

/**
 * The shared pull loop every terminal is written against. It owns the parts that are easy to get
 * subtly wrong and must not be re-implemented per terminal: the iterator is closed on cancel, on a
 * short circuit, and on an abrupt callback completion, and it is closed exactly once because the
 * loop stops at the first of those.
 *
 * `step` decides per item whether to keep pulling or to stop with a result, and `complete` produces
 * the result when the source runs out. Throwing out of `complete` rejects, which is how `reduce`
 * reports an empty source with no initial value.
 *
 * A rejected `next()` is the one case that does NOT close the iterator: a source that fails has
 * already finished, so calling `return()` on it would be a second completion.
 */
function drive<T, R>(
  deps: ICallbackDeps,
  runItem: (callback: (...args: any[]) => any, args: any[]) => IItemRun,
  source: AnyIterable<T>,
  step: (value: T, index: number, run: TRunStep) => TStep<R> | PromiseLike<TStep<R>>,
  complete: () => R,
): PromiseLike<R> {
  const { Impl } = deps;

  return new Impl<R>((resolve, reject, ctx) => {
    let iterator: AsyncIterator<T> | undefined;
    let item: IItemRun | undefined;
    let stopped = false;
    let index = 0;

    // Registered before the source is even opened, so a cancel that lands between construction and
    // the first pull still closes whatever was opened and stops the loop.
    const abandon = (): unknown => {
      stopped = true;

      const current = item;
      item = undefined;

      // Aborts what an in-flight callback waits on and resumes a generator body so its own cleanup
      // runs, the same way a stopped operator abandons an item.
      if (current) {
        current.stop();
      }

      return iterator ? callReturn(iterator) : undefined;
    };

    if (ctx && isFunction(ctx.handleCancel)) {
      ctx.handleCancel(abandon);
    }

    try {
      iterator = getSource(source).it;
    } catch (error) {
      reject(error);

      return;
    }

    const it = iterator;

    const closeThen = (settle: () => void): void => {
      Impl.resolve(callReturn(it)).then(settle, settle);
    };

    const failBody = (error: unknown): void => {
      if (stopped) {
        return;
      }

      stopped = true;
      closeThen(() => reject(error));
    };

    const onStep = (outcome: TStep<R>): void => {
      if (stopped) {
        return;
      }

      if (outcome.done) {
        stopped = true;
        closeThen(() => resolve(outcome.value));

        return;
      }

      pull();
    };

    const run: TRunStep = (callback, args) => {
      const current = runItem(callback, args);
      item = current;

      return current.result.then(
        (value: unknown) => {
          item = undefined;

          return value;
        },
        (error: unknown) => {
          item = undefined;

          throw error;
        },
      );
    };

    const onValue = (value: T): void => {
      let outcome: TStep<R> | PromiseLike<TStep<R>>;

      try {
        outcome = step(value, index++, run);
      } catch (error) {
        failBody(error);

        return;
      }

      if (isThenableLike<TStep<R>>(outcome)) {
        Impl.resolve(outcome).then(onStep, failBody);

        return;
      }

      onStep(outcome);
    };

    const fail = (error: unknown): void => {
      if (stopped) {
        return;
      }

      stopped = true;
      reject(error);
    };

    const pull = (): void => {
      if (stopped) {
        return;
      }

      let next: PromiseLike<IteratorResult<T>> | IteratorResult<T>;

      try {
        next = it.next();
      } catch (error) {
        fail(error);

        return;
      }

      Impl.resolve(next).then((result: IteratorResult<T>) => {
        if (stopped) {
          return;
        }

        if (result.done) {
          let value: R;

          try {
            value = complete();
          } catch (error) {
            fail(error);

            return;
          }

          stopped = true;
          resolve(value);

          return;
        }

        onValue(result.value);
      }, fail);
    };

    pull();
  });
}

/** Bind `toArray` to one promise implementation. */
export function toArrayFactory(deps: ICallbackDeps) {
  const { runItem } = callbackFactory(deps);

  /** Collect every value the source produces. */
  return function toArray<T>(source: AnyIterable<T>): PromiseLike<T[]> {
    const values: T[] = [];

    return drive<T, T[]>(
      deps,
      runItem,
      source,
      (value) => {
        values.push(value);

        return CONTINUE;
      },
      () => values,
    );
  };
}

/** Bind `reduce` to one promise implementation. */
export function reduceFactory(deps: ICallbackDeps) {
  const { runItem } = callbackFactory(deps);

  /**
   * Fold the source into a single value. Called without an initial value, the first item seeds the
   * accumulator and the reducer first runs for the second item, which is also why an empty source
   * with no initial value has no answer to give and rejects.
   */
  return function reduce<T, A>(source: AnyIterable<T>, reducer: TIterReducer<T, A>, ...initial: [A?]): PromiseLike<A> {
    let seeded = initial.length > 0;
    let accumulator = initial[0] as A;

    return drive<T, A>(
      deps,
      runItem,
      source,
      (value, index, run) => {
        if (!seeded) {
          seeded = true;
          accumulator = value as unknown as A;

          return CONTINUE;
        }

        return run(reducer, [accumulator, value, index]).then((next: A) => {
          accumulator = next;

          return CONTINUE;
        });
      },
      () => {
        if (!seeded) {
          throw new TypeError('Reduce of empty async iterator with no initial value');
        }

        return accumulator;
      },
    );
  };
}

/** Bind `find` to one promise implementation. */
export function findFactory(deps: ICallbackDeps) {
  const { runItem } = callbackFactory(deps);

  /** The first value the predicate accepts, or `undefined` when the source runs out. */
  return function find<T>(source: AnyIterable<T>, predicate: TIterPredicate<T>): PromiseLike<T | undefined> {
    return drive<T, T | undefined>(
      deps,
      runItem,
      source,
      (value, index, run) =>
        run(predicate, [value, index]).then((matched: unknown) => (matched ? stopWith(value) : CONTINUE)),
      () => undefined,
    );
  };
}

/** Bind `some` to one promise implementation. */
export function someFactory(deps: ICallbackDeps) {
  const { runItem } = callbackFactory(deps);

  /** Whether the predicate accepts any value. An empty source is `false`. */
  return function some<T>(source: AnyIterable<T>, predicate: TIterPredicate<T>): PromiseLike<boolean> {
    return drive<T, boolean>(
      deps,
      runItem,
      source,
      (value, index, run) =>
        run(predicate, [value, index]).then((matched: unknown) => (matched ? stopWith(true) : CONTINUE)),
      () => false,
    );
  };
}

/** Bind `every` to one promise implementation. */
export function everyFactory(deps: ICallbackDeps) {
  const { runItem } = callbackFactory(deps);

  /** Whether the predicate accepts every value. An empty source is `true`. */
  return function every<T>(source: AnyIterable<T>, predicate: TIterPredicate<T>): PromiseLike<boolean> {
    return drive<T, boolean>(
      deps,
      runItem,
      source,
      (value, index, run) =>
        run(predicate, [value, index]).then((matched: unknown) => (matched ? CONTINUE : stopWith(false))),
      () => true,
    );
  };
}

/** Bind `forEach` to one promise implementation. */
export function forEachFactory(deps: ICallbackDeps) {
  const { runItem } = callbackFactory(deps);

  /** Run the callback for every value, in order, waiting for each before pulling the next. */
  return function forEach<T>(source: AnyIterable<T>, visitor: TIterVisitor<T>): PromiseLike<void> {
    return drive<T, void>(
      deps,
      runItem,
      source,
      (value, index, run) => run(visitor, [value, index]).then(() => CONTINUE),
      () => undefined,
    );
  };
}

/** Bind `includes` to one promise implementation. */
export function includesFactory(deps: ICallbackDeps) {
  const { runItem } = callbackFactory(deps);

  /** Whether the source produces the searched value, compared the way `Array.prototype.includes` does. */
  return function includes<T>(source: AnyIterable<T>, searchValue: T): PromiseLike<boolean> {
    return drive<T, boolean>(
      deps,
      runItem,
      source,
      (value) => (sameValueZero(value, searchValue) ? stopWith(true) : CONTINUE),
      () => false,
    );
  };
}
