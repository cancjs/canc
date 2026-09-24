import type { TAnyFn } from '../../_util/guards';

/**
 * Brand symbol identifying a pipe operator function.
 *
 * Attached to operator functions by `markPipeOp` so `pipe` recognizes them during composition.
 */
export const PIPE_OP_BRAND = Symbol.for('@cancjs/toolbox:PipeOp');

/**
 * Brand symbol identifying a terminal operator function.
 *
 * Attached to terminal functions by `markTermOp` so `pipe` recognizes the final step of a pipeline.
 */
export const TERM_OP_BRAND = Symbol.for('@cancjs/toolbox:TermOp');

/**
 * Brand symbol identifying a pipeable async iterable wrapper.
 *
 * Attached to async iterable wrappers by `makePipeable` to indicate `.pipe` availability and avoid redundant wrapping.
 */
export const PIPEABLE_BRAND = Symbol.for('@cancjs/toolbox:Pipeable');

/**
 * Lazy transform converting an input async iterable into an output async iterable.
 *
 * Carries `PIPE_OP_BRAND` so `pipe` distinguishes intermediate stream operators from terminal consumers.
 */
export interface IPipeOp<I, O> {
  (source: AsyncIterable<I>): AsyncIterable<O>;
  readonly [PIPE_OP_BRAND]: true;
}

/** Convenient alias matching the design document naming. */
export type PipeOp<I, O> = IPipeOp<I, O>;

/**
 * Terminal consumer converting an input async iterable into a promise.
 *
 * Carries `TERM_OP_BRAND` so `pipe` recognizes the terminal operation that ends pipeline execution.
 */
export interface ITermOp<I, R> {
  (source: AsyncIterable<I>): PromiseLike<R>;
  readonly [TERM_OP_BRAND]: true;
}

/** Convenient alias matching the design document naming. */
export type TermOp<I, R> = ITermOp<I, R>;

/**
 * Brands a transformation function as a pipe operator.
 *
 * Attaches `PIPE_OP_BRAND` so `pipe` and `isPipeOp` recognize the function as a stream transformer.
 */
export function markPipeOp<I, O>(fn: (source: AsyncIterable<I>) => AsyncIterable<O>): IPipeOp<I, O> {
  const branded = fn as any;
  Object.defineProperty(branded, PIPE_OP_BRAND, { value: true });
  return branded;
}

/**
 * Brands a consuming function as a terminal operator.
 *
 * Attaches `TERM_OP_BRAND` so `pipe` and `isTermOp` recognize the function as a terminal stream consumer.
 */
export function markTermOp<I, R>(fn: (source: AsyncIterable<I>) => PromiseLike<R>): ITermOp<I, R> {
  const branded = fn as any;
  Object.defineProperty(branded, TERM_OP_BRAND, { value: true });
  return branded;
}

/**
 * Returns true if the value is an `IPipeOp` branded function.
 */
export function isPipeOp(value: unknown): value is IPipeOp<any, any> {
  return typeof value === 'function' && (value as any)[PIPE_OP_BRAND] === true;
}

/**
 * Returns true if the value is an `ITermOp` branded function.
 */
export function isTermOp(value: unknown): value is ITermOp<any, any> {
  return typeof value === 'function' && (value as any)[TERM_OP_BRAND] === true;
}

/**
 * Outcome of walking a pipeline that never reaches a terminal, carrying the element type it ends on.
 */
export interface IPipeWalkLazy<T> {
  readonly kind: 'lazy';
  readonly element: T;
}

/**
 * Outcome of walking a pipeline that ends in a terminal, carrying the value the terminal resolves.
 */
export interface IPipeWalkTerm<R> {
  readonly kind: 'term';
  readonly result: R;
}

/**
 * Walks an operator list, threading the element type from one operator to the next.
 *
 * A tuple entry that is itself a list is spliced in, so grouped and nested forms read the same as a
 * flat list. Anything the walk cannot make sense of, including an operator whose input does not
 * match the element type reaching it and a terminal that is not last, resolves to `never`.
 *
 * A list whose length TypeScript does not know, which is what an array literal nested inside another
 * array literal infers to, is threaded as a single application of its element type. That is exact
 * for a group of one and for operators that do not change the element type.
 */
export type TPipeWalk<TCurrent, TOps extends readonly unknown[]> =
  number extends TOps['length'] ? TPipeWalkOp<TCurrent, TOps[number], readonly []>
  : TOps extends readonly [infer THead, ...infer TRest] ? TPipeWalkHead<TCurrent, THead, TRest>
  : IPipeWalkLazy<TCurrent>;

type TPipeWalkHead<TCurrent, THead, TRest extends readonly unknown[]> =
  THead extends readonly unknown[] ?
    number extends THead['length'] ?
      TPipeWalkOp<TCurrent, THead[number], TRest>
    : TPipeWalk<TCurrent, readonly [...THead, ...TRest]>
  : TPipeWalkOp<TCurrent, THead, TRest>;

type TPipeWalkOp<TCurrent, TOp, TRest extends readonly unknown[]> =
  0 extends 1 & TOp ?
    // an `any` operator says nothing about either side, so the element type goes with it
    TPipeWalk<any, TRest>
  : [TOp] extends [ITermOp<infer I, infer R>] ?
    [TCurrent] extends [I] ?
      TRest extends readonly [] ?
        IPipeWalkTerm<R>
      : never
    : never
  : [TOp] extends [IPipeOp<infer I, infer O>] ?
    [TCurrent] extends [I] ?
      TPipeWalk<O, TRest>
    : never
  : [TOp] extends [TAnyFn] ? never
  : // the options object is split out before the operators run, so it threads nothing
  [TOp] extends [object] ? TPipeWalk<TCurrent, TRest>
  : never;

/**
 * Element type an operator list ends on, or `never` when the list does not thread or ends early.
 *
 * Used as the input side of a trailing terminal so the terminal infers its own type argument from
 * the operators before it.
 */
export type TPipeElementOf<TSource, TOps extends readonly unknown[]> =
  [TPipeWalk<TSource, TOps>] extends [never] ? never
  : TPipeWalk<TSource, TOps> extends IPipeWalkLazy<infer TCurrent> ? TCurrent
  : never;

/**
 * Return type of the array-grouped `pipe`, with no terminal supplied outside the group.
 */
export type TPipeGrouped<TSource, TOps extends readonly unknown[]> =
  [TPipeWalk<TSource, TOps>] extends [never] ? never
  : TPipeWalk<TSource, TOps> extends IPipeWalkTerm<infer R> ? PromiseLike<R>
  : TPipeWalk<TSource, TOps> extends IPipeWalkLazy<infer TCurrent> ? IPipeableAsyncIterable<TCurrent>
  : never;

/**
 * Return type of the array-grouped `pipe` with a trailing terminal.
 *
 * The group has to thread and has to end lazily, so a terminal inside the group followed by a second
 * one outside it resolves to `never` rather than quietly dropping a step.
 */
export type TPipeGroupedTerm<TSource, TOps extends readonly unknown[], R> =
  [TPipeWalk<TSource, TOps>] extends [never] ? never
  : // any here checks the walk shape (lazy vs terminal), not the element type
  TPipeWalk<TSource, TOps> extends IPipeWalkLazy<any> ? PromiseLike<R>
  : never;

/**
 * Async iterable augmented with a fluent `.pipe()` method.
 *
 * Produced by `makePipeable` or `pipe` to allow chaining operators directly on the iterable.
 *
 * The `.pipe` overloads mirror the free `pipe` without its source argument: a lazy set that returns
 * another pipeable iterable, and a terminal set that ends the chain in a promise. A terminal placed
 * anywhere but last, or a second terminal, matches no overload and is a compile error.
 */
export interface IPipeableAsyncIterable<T> extends AsyncIterable<T> {
  readonly [PIPEABLE_BRAND]: true;
  pipe(): IPipeableAsyncIterable<T>;
  pipe<R>(term: ITermOp<T, R>): PromiseLike<R>;
  pipe<B1>(op1: IPipeOp<T, B1>): IPipeableAsyncIterable<B1>;
  pipe<B1, R>(op1: IPipeOp<T, B1>, term: ITermOp<B1, R>): PromiseLike<R>;
  pipe<B1, B2>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>): IPipeableAsyncIterable<B2>;
  pipe<B1, B2, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, term: ITermOp<B2, R>): PromiseLike<R>;
  pipe<B1, B2, B3>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>): IPipeableAsyncIterable<B3>;
  pipe<B1, B2, B3, R>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    term: ITermOp<B3, R>,
  ): PromiseLike<R>;
  pipe<B1, B2, B3, B4>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
  ): IPipeableAsyncIterable<B4>;
  pipe<B1, B2, B3, B4, R>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    term: ITermOp<B4, R>,
  ): PromiseLike<R>;
  pipe<B1, B2, B3, B4, B5>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
  ): IPipeableAsyncIterable<B5>;
  pipe<B1, B2, B3, B4, B5, R>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    term: ITermOp<B5, R>,
  ): PromiseLike<R>;
  pipe<B1, B2, B3, B4, B5, B6>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    op6: IPipeOp<B5, B6>,
  ): IPipeableAsyncIterable<B6>;
  pipe<B1, B2, B3, B4, B5, B6, R>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    op6: IPipeOp<B5, B6>,
    term: ITermOp<B6, R>,
  ): PromiseLike<R>;
  pipe<B1, B2, B3, B4, B5, B6, B7>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    op6: IPipeOp<B5, B6>,
    op7: IPipeOp<B6, B7>,
  ): IPipeableAsyncIterable<B7>;
  pipe<B1, B2, B3, B4, B5, B6, B7, R>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    op6: IPipeOp<B5, B6>,
    op7: IPipeOp<B6, B7>,
    term: ITermOp<B7, R>,
  ): PromiseLike<R>;
  pipe<B1, B2, B3, B4, B5, B6, B7, B8>(
    op1: IPipeOp<T, B1>,
    op2: IPipeOp<B1, B2>,
    op3: IPipeOp<B2, B3>,
    op4: IPipeOp<B3, B4>,
    op5: IPipeOp<B4, B5>,
    op6: IPipeOp<B5, B6>,
    op7: IPipeOp<B6, B7>,
    op8: IPipeOp<B7, B8>,
  ): IPipeableAsyncIterable<B8>;
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
  ): PromiseLike<R>;
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
  ): IPipeableAsyncIterable<B9>;
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
  ): PromiseLike<R>;
  pipe<TOps extends readonly unknown[], R>(
    ops: readonly [...TOps],
    term: ITermOp<TPipeElementOf<T, TOps>, R>,
  ): TPipeGroupedTerm<T, TOps, R>;
  pipe<TOps extends readonly unknown[]>(ops: readonly [...TOps]): TPipeGrouped<T, TOps>;
}

/**
 * Returns true if the value is an `IPipeableAsyncIterable` carrying `PIPEABLE_BRAND`.
 */
export function isPipeable(value: unknown): value is IPipeableAsyncIterable<any> {
  return typeof value === 'object' && value !== null && (value as any)[PIPEABLE_BRAND] === true;
}

/**
 * Async or synchronous iterable source accepted by async iterable operators and utilities.
 *
 * Used across `from`, `pipe`, and terminal operators to accept both `AsyncIterable` and standard `Iterable` inputs.
 */
export type AnyIterable<T> = AsyncIterable<T> | Iterable<T>;

/**
 * Anything a source function or a pipeline head accepts as input.
 *
 * A synchronous iterable may hand out promises, which are awaited as they are pulled, so the two
 * iterable forms are spelled out separately rather than through `AnyIterable`. A single promise
 * produces one value.
 */
export type TAnySource<T> = AsyncIterable<T> | Iterable<T | PromiseLike<T>> | PromiseLike<T>;

/**
 * Element type a source produces once it has been normalized.
 *
 * A synchronous iterable of promises is awaited value by value as it is pulled, so its element type
 * is the awaited one; an async iterable is taken at face value, and a lone promise produces its
 * resolved value.
 */
export type TElementOf<TSource> =
  TSource extends AsyncIterable<infer T> ? T
  : TSource extends Iterable<infer T> ? Awaited<T>
  : TSource extends PromiseLike<infer T> ? Awaited<T>
  : never;

export type { TPromiseCtor } from '../construct';
