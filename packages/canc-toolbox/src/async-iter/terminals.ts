import { CancelablePromise } from '@cancjs/promise';

import type { AnyIterable, ITermOp, TPromiseCtor } from '../../../_toolbox/async-iter';
import { markTermOp } from '../../../_toolbox/async-iter';
import type { TIterPredicate, TIterReducer, TIterVisitor } from '../../../_toolbox/async-iter/terminals';
import * as tb from '../../../_toolbox/async-iter/terminals';

/**
 * The one place stating that CancelablePromise satisfies the minimal constructor shape the shared
 * algorithms build against; TypeScript cannot see that across the package boundary on its own.
 */
const Impl = CancelablePromise as unknown as TPromiseCtor;

/**
 * A terminal bound to CancelablePromise. It carries the same brand the pipe reads, and calling it
 * states the concrete promise the caller gets, so cancelling a drive needs no cast.
 */
export interface ICancelableTermOp<I, R> extends ITermOp<I, R> {
  (source: AnyIterable<I>): CancelablePromise<R>;
}

/**
 * Brand a bound terminal. The cast is what narrows the shared brand helper's `PromiseLike` result
 * to the promise this package actually builds.
 */
function bind<I, R>(run: (source: AnyIterable<I>) => CancelablePromise<R>): ICancelableTermOp<I, R> {
  return markTermOp<I, R>(run) as ICancelableTermOp<I, R>;
}

/** Collect every value the source produces. */
export function toArray<I>(): ICancelableTermOp<I, I[]> {
  return bind<I, I[]>((source) => tb.toArray<I>(Impl, source) as CancelablePromise<I[]>);
}

/**
 * Fold the source into a single value. Without an initial value the first item seeds the
 * accumulator, so an empty source rejects with a TypeError.
 */
export function reduce<I, A>(reducer: TIterReducer<I, A>, initial: A): ICancelableTermOp<I, A>;
export function reduce<I>(reducer: TIterReducer<I, I>): ICancelableTermOp<I, I>;
export function reduce<I, A>(reducer: TIterReducer<I, A>, ...initial: [A?]): ICancelableTermOp<I, A> {
  return bind<I, A>((source) => tb.reduce<I, A>(Impl, source, reducer, ...initial) as CancelablePromise<A>);
}

/** The first value the predicate accepts, or `undefined` when the source runs out. */
export function find<I>(predicate: TIterPredicate<I>): ICancelableTermOp<I, I | undefined> {
  return bind<I, I | undefined>((source) => tb.find<I>(Impl, source, predicate) as CancelablePromise<I | undefined>);
}

/** Whether the predicate accepts any value. An empty source is `false`. */
export function some<I>(predicate: TIterPredicate<I>): ICancelableTermOp<I, boolean> {
  return bind<I, boolean>((source) => tb.some<I>(Impl, source, predicate) as CancelablePromise<boolean>);
}

/** Whether the predicate accepts every value. An empty source is `true`. */
export function every<I>(predicate: TIterPredicate<I>): ICancelableTermOp<I, boolean> {
  return bind<I, boolean>((source) => tb.every<I>(Impl, source, predicate) as CancelablePromise<boolean>);
}

/** Run the callback for every value, in order, waiting for each before pulling the next. */
export function forEach<I>(visitor: TIterVisitor<I>): ICancelableTermOp<I, void> {
  return bind<I, void>((source) => tb.forEach<I>(Impl, source, visitor) as CancelablePromise<void>);
}

/** Whether the source produces the searched value, compared the way `Array.prototype.includes` does. */
export function includes<I>(searchValue: I): ICancelableTermOp<I, boolean> {
  return bind<I, boolean>((source) => tb.includes<I>(Impl, source, searchValue) as CancelablePromise<boolean>);
}
