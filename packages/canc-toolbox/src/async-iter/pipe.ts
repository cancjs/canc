import type { CancelablePromise } from '@cancjs/promise';

import type { IPipeableAsyncIterable, IPipeOp, ITermOp } from '../../../_toolbox/async-iter';
import type { TPipeSource } from '../../../_toolbox/async-iter/pipe';
import { applyPipe } from '../../../_toolbox/async-iter/pipe';

/**
 * A pipeable async iterable whose terminals are bound to CancelablePromise.
 *
 * Every terminal reachable from this entry is canc-bound, so a chained `.pipe(..., terminal)` really
 * does hand back a CancelablePromise; the shared interface can only promise `PromiseLike` because it
 * is canc-free.
 */
export interface ICancelablePipeable<T> extends IPipeableAsyncIterable<T> {
  pipe(): ICancelablePipeable<T>;
  pipe<R>(term: ITermOp<T, R>): CancelablePromise<R>;
  pipe<B1>(op1: IPipeOp<T, B1>): ICancelablePipeable<B1>;
  pipe<B1, R>(op1: IPipeOp<T, B1>, term: ITermOp<B1, R>): CancelablePromise<R>;
  pipe<B1, B2>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>): ICancelablePipeable<B2>;
  pipe<B1, B2, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, term: ITermOp<B2, R>): CancelablePromise<R>;
  pipe<B1, B2, B3>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>): ICancelablePipeable<B3>;
  pipe<B1, B2, B3, R>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    term: ITermOp<B3, R>,
  ): CancelablePromise<R>;
  pipe<B1, B2, B3, B4>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
  ): ICancelablePipeable<B4>;
  pipe<B1, B2, B3, B4, R>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    term: ITermOp<B4, R>,
  ): CancelablePromise<R>;
  pipe<B1, B2, B3, B4, B5>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
  ): ICancelablePipeable<B5>;
  pipe<B1, B2, B3, B4, B5, R>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    term: ITermOp<B5, R>,
  ): CancelablePromise<R>;
  pipe<B1, B2, B3, B4, B5, B6>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    op6: IPipeOp<B5, B6>,
  ): ICancelablePipeable<B6>;
  pipe<B1, B2, B3, B4, B5, B6, R>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    op6: IPipeOp<B5, B6>,
    term: ITermOp<B6, R>,
  ): CancelablePromise<R>;
  pipe<B1, B2, B3, B4, B5, B6, B7>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    op6: IPipeOp<B5, B6>,
    op7: IPipeOp<B6, B7>,
  ): ICancelablePipeable<B7>;
  pipe<B1, B2, B3, B4, B5, B6, B7, R>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    op6: IPipeOp<B5, B6>,
    op7: IPipeOp<B6, B7>,
    term: ITermOp<B7, R>,
  ): CancelablePromise<R>;
  pipe<B1, B2, B3, B4, B5, B6, B7, B8>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    op6: IPipeOp<B5, B6>,
    op7: IPipeOp<B6, B7>,
    op8: IPipeOp<B7, B8>,
  ): ICancelablePipeable<B8>;
  pipe<B1, B2, B3, B4, B5, B6, B7, B8, R>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    op6: IPipeOp<B5, B6>,
    op7: IPipeOp<B6, B7>,
    op8: IPipeOp<B7, B8>,
    term: ITermOp<B8, R>,
  ): CancelablePromise<R>;
  pipe<B1, B2, B3, B4, B5, B6, B7, B8, B9>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    op6: IPipeOp<B5, B6>,
    op7: IPipeOp<B6, B7>,
    op8: IPipeOp<B7, B8>,
    op9: IPipeOp<B8, B9>,
  ): ICancelablePipeable<B9>;
  pipe<B1, B2, B3, B4, B5, B6, B7, B8, B9, R>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    op6: IPipeOp<B5, B6>,
    op7: IPipeOp<B6, B7>,
    op8: IPipeOp<B7, B8>,
    op9: IPipeOp<B8, B9>,
    term: ITermOp<B9, R>,
  ): CancelablePromise<R>;
  pipe<R>(ops: readonly unknown[], term: ITermOp<any, R>, ...rest: unknown[]): CancelablePromise<R>;
  pipe(ops: readonly unknown[]): ICancelablePipeable<any>;
}

/**
 * Pipe a source through operators and optionally a terminal bound to CancelablePromise.
 *
 * The overloads mirror the shared ladder and narrow the terminal return to CancelablePromise, so a
 * pipeline ends in something cancelable without a cast. The runtime is the shared algorithm.
 */
export function pipe<A>(source: TPipeSource<A>): ICancelablePipeable<A>;
export function pipe<A, R>(source: TPipeSource<A>, term: ITermOp<A, R>): CancelablePromise<R>;
export function pipe<A, B1>(source: TPipeSource<A>, op1: IPipeOp<A, B1>): ICancelablePipeable<B1>;
export function pipe<A, B1, R>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, term: ITermOp<B1, R>): CancelablePromise<R>;
export function pipe<A, B1, B2>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
): ICancelablePipeable<B2>;
export function pipe<A, B1, B2, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  term: ITermOp<B2, R>,
): CancelablePromise<R>;
export function pipe<A, B1, B2, B3>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
): ICancelablePipeable<B3>;
export function pipe<A, B1, B2, B3, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  term: ITermOp<B3, R>,
): CancelablePromise<R>;
export function pipe<A, B1, B2, B3, B4>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
): ICancelablePipeable<B4>;
export function pipe<A, B1, B2, B3, B4, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  term: ITermOp<B4, R>,
): CancelablePromise<R>;
export function pipe<A, B1, B2, B3, B4, B5>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
): ICancelablePipeable<B5>;
export function pipe<A, B1, B2, B3, B4, B5, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  term: ITermOp<B5, R>,
): CancelablePromise<R>;
export function pipe<A, B1, B2, B3, B4, B5, B6>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
): ICancelablePipeable<B6>;
export function pipe<A, B1, B2, B3, B4, B5, B6, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  term: ITermOp<B6, R>,
): CancelablePromise<R>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  op7: IPipeOp<B6, B7>,
): ICancelablePipeable<B7>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  op7: IPipeOp<B6, B7>,
  term: ITermOp<B7, R>,
): CancelablePromise<R>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7, B8>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  op7: IPipeOp<B6, B7>,
  op8: IPipeOp<B7, B8>,
): ICancelablePipeable<B8>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7, B8, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  op7: IPipeOp<B6, B7>,
  op8: IPipeOp<B7, B8>,
  term: ITermOp<B8, R>,
): CancelablePromise<R>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7, B8, B9>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  op7: IPipeOp<B6, B7>,
  op8: IPipeOp<B7, B8>,
  op9: IPipeOp<B8, B9>,
): ICancelablePipeable<B9>;
export function pipe<A, B1, B2, B3, B4, B5, B6, B7, B8, B9, R>(
  source: TPipeSource<A>,
  op1: IPipeOp<A, B1>,
  op2: IPipeOp<B1, B2>,
  op3: IPipeOp<B2, B3>,
  op4: IPipeOp<B3, B4>,
  op5: IPipeOp<B4, B5>,
  op6: IPipeOp<B5, B6>,
  op7: IPipeOp<B6, B7>,
  op8: IPipeOp<B7, B8>,
  op9: IPipeOp<B8, B9>,
  term: ITermOp<B9, R>,
): CancelablePromise<R>;
/**
 * Array-grouped form, which the ladder above does not cover.
 *
 * An array of operators is matched as a whole, so the element type is not threaded through it and a
 * mismatch between two grouped operators is caught by the runtime rather than the compiler.
 */
export function pipe<A, R>(
  source: TPipeSource<A>,
  ops: readonly unknown[],
  term: ITermOp<any, R>,
  ...rest: unknown[]
): CancelablePromise<R>;
export function pipe<A>(source: TPipeSource<A>, ops: readonly unknown[]): ICancelablePipeable<any>;
export function pipe(source: TPipeSource<unknown>, ...parts: unknown[]): unknown {
  return applyPipe(source, parts);
}
