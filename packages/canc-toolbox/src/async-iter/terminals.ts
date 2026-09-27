import { CancelablePromise } from '@cancjs/promise';

import type { AnyIterable, ITermOp } from '../../../_toolbox/async-iter';
import { markTermOp } from '../../../_toolbox/async-iter';
import type { TIterPredicate, TIterReducer, TIterVisitor } from '../../../_toolbox/async-iter/terminals';
import {
  everyFactory,
  findFactory,
  forEachFactory,
  includesFactory,
  reduceFactory,
  someFactory,
  toArrayFactory,
} from '../../../_toolbox/async-iter/terminals';
import type { TPromiseCtor } from '../../../_toolbox/async-iter/types';

/**
 * The one place stating that CancelablePromise satisfies the minimal constructor shape the shared
 * algorithms build against; TypeScript cannot see that across the package boundary on its own.
 */
const Impl = CancelablePromise as unknown as TPromiseCtor;

const deps = { Impl };

/**
 * A terminal bound to CancelablePromise. It carries the same brand the pipe reads, and calling it
 * states the concrete promise the caller gets, so cancelling a drive needs no cast.
 */
export interface ICancelableTermOp<I, R> extends ITermOp<I, R> {
  (source: AnyIterable<I>): CancelablePromise<R>;
}

const boundToArray = toArrayFactory(deps);
const boundReduce = reduceFactory(deps);
const boundFind = findFactory(deps);
const boundSome = someFactory(deps);
const boundEvery = everyFactory(deps);
const boundForEach = forEachFactory(deps);
const boundIncludes = includesFactory(deps);

/** Collect every value the source produces. */
export function toArray<I>(): ICancelableTermOp<I, I[]> {
  return markTermOp<I, I[]>((source) => boundToArray<I>(source)) as ICancelableTermOp<I, I[]>;
}

/**
 * Fold the source into a single value. Without an initial value the first item seeds the
 * accumulator, so an empty source rejects with a TypeError.
 */
export function reduce<I, A>(reducer: TIterReducer<I, A>, initial: A): ICancelableTermOp<I, A>;
export function reduce<I>(reducer: TIterReducer<I, I>): ICancelableTermOp<I, I>;
export function reduce<I, A>(reducer: TIterReducer<I, A>, ...initial: [A?]): ICancelableTermOp<I, A> {
  return markTermOp<I, A>((source) => boundReduce<I, A>(source, reducer, ...initial)) as ICancelableTermOp<I, A>;
}

/** The first value the predicate accepts, or `undefined` when the source runs out. */
export function find<I>(predicate: TIterPredicate<I>): ICancelableTermOp<I, I | undefined> {
  return markTermOp<I, I | undefined>((source) => boundFind<I>(source, predicate)) as ICancelableTermOp<
    I,
    I | undefined
  >;
}

/** Whether the predicate accepts any value. An empty source is `false`. */
export function some<I>(predicate: TIterPredicate<I>): ICancelableTermOp<I, boolean> {
  return markTermOp<I, boolean>((source) => boundSome<I>(source, predicate)) as ICancelableTermOp<I, boolean>;
}

/** Whether the predicate accepts every value. An empty source is `true`. */
export function every<I>(predicate: TIterPredicate<I>): ICancelableTermOp<I, boolean> {
  return markTermOp<I, boolean>((source) => boundEvery<I>(source, predicate)) as ICancelableTermOp<I, boolean>;
}

/** Run the callback for every value, in order, waiting for each before pulling the next. */
export function forEach<I>(visitor: TIterVisitor<I>): ICancelableTermOp<I, void> {
  return markTermOp<I, void>((source) => boundForEach<I>(source, visitor)) as ICancelableTermOp<I, void>;
}

/** Whether the source produces the searched value, compared the way `Array.prototype.includes` does. */
export function includes<I>(searchValue: I): ICancelableTermOp<I, boolean> {
  return markTermOp<I, boolean>((source) => boundIncludes<I>(source, searchValue)) as ICancelableTermOp<I, boolean>;
}
