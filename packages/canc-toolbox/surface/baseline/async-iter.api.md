# Public surface: @cancjs/toolbox ./async-iter

Generated. Do not edit by hand.

- Declarations: `packages/canc-toolbox/dist/types/async-iter.d.ts`
- Exports: 28

## `AnyIterable<T>` (type)

```text
AsyncIterable<T> | Iterable<T>
```

## `ICancelablePipeable<T>` (interface)

```text
extends IPipeableAsyncIterable<T>
readonly [PIPEABLE_BRAND]: true
pipe: { (): ICancelablePipeable<T>; <R>(term: ITermOp<T, R>): CancelablePromise<R>; <B1>(op1: IPipeOp<T, B1>): ICancelablePipeable<B1>; <B1, R>(op1: IPipeOp<T, B1>, term: ITermOp<B1, R>): CancelablePromise<R>; <B1, B2>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>): ICancelablePipeable<B2>; <B1, B2, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, term: ITermOp<B2, R>): CancelablePromise<R>; <B1, B2, B3>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>): ICancelablePipeable<B3>; <B1, B2, B3, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, term: ITermOp<B3, R>): CancelablePromise<R>; <B1, B2, B3, B4>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>): ICancelablePipeable<B4>; <B1, B2, B3, B4, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, term: ITermOp<B4, R>): CancelablePromise<R>; <B1, B2, B3, B4, B5>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>): ICancelablePipeable<B5>; <B1, B2, B3, B4, B5, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, term: ITermOp<B5, R>): CancelablePromise<R>; <B1, B2, B3, B4, B5, B6>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>): ICancelablePipeable<B6>; <B1, B2, B3, B4, B5, B6, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, term: ITermOp<B6, R>): CancelablePromise<R>; <B1, B2, B3, B4, B5, B6, B7>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>): ICancelablePipeable<B7>; <B1, B2, B3, B4, B5, B6, B7, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, term: ITermOp<B7, R>): CancelablePromise<R>; <B1, B2, B3, B4, B5, B6, B7, B8>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, op8: IPipeOp<B7, B8>): ICancelablePipeable<B8>; <B1, B2, B3, B4, B5, B6, B7, B8, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, op8: IPipeOp<B7, B8>, term: ITermOp<B8, R>): CancelablePromise<R>; <B1, B2, B3, B4, B5, B6, B7, B8, B9>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, op8: IPipeOp<B7, B8>, op9: IPipeOp<B8, B9>): ICancelablePipeable<B9>; <B1, B2, B3, B4, B5, B6, B7, B8, B9, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, op8: IPipeOp<B7, B8>, op9: IPipeOp<B8, B9>, term: ITermOp<B9, R>): CancelablePromise<R>; <TOps extends readonly unknown[], R>(ops: readonly [...TOps], term: ITermOp<TPipeElementOf<T, TOps>, R>): TCancelableGroupedTerm<T, TOps, R>; <TOps extends readonly unknown[]>(ops: readonly [...TOps]): TCancelableGrouped<T, TOps>; }
```

## `ICancelableTermOp<I, R>` (interface)

```text
extends ITermOp<I, R>
(source: AnyIterable<I>): CancelablePromise<R, never>
(source: AsyncIterable<I>): PromiseLike<R>
readonly [TERM_OP_BRAND]: true
```

## `IPipeOp<I, O>` (interface)

```text
(source: AsyncIterable<I>): AsyncIterable<O>
readonly [PIPE_OP_BRAND]: true
```

## `IPipeableAsyncIterable<T>` (interface)

```text
extends AsyncIterable<T>
readonly [PIPEABLE_BRAND]: true
pipe: { (): IPipeableAsyncIterable<T>; <R>(term: ITermOp<T, R>): PromiseLike<R>; <B1>(op1: IPipeOp<T, B1>): IPipeableAsyncIterable<B1>; <B1, R>(op1: IPipeOp<T, B1>, term: ITermOp<B1, R>): PromiseLike<R>; <B1, B2>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>): IPipeableAsyncIterable<B2>; <B1, B2, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, term: ITermOp<B2, R>): PromiseLike<R>; <B1, B2, B3>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>): IPipeableAsyncIterable<B3>; <B1, B2, B3, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, term: ITermOp<B3, R>): PromiseLike<R>; <B1, B2, B3, B4>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>): IPipeableAsyncIterable<B4>; <B1, B2, B3, B4, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, term: ITermOp<B4, R>): PromiseLike<R>; <B1, B2, B3, B4, B5>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>): IPipeableAsyncIterable<B5>; <B1, B2, B3, B4, B5, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, term: ITermOp<B5, R>): PromiseLike<R>; <B1, B2, B3, B4, B5, B6>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>): IPipeableAsyncIterable<B6>; <B1, B2, B3, B4, B5, B6, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, term: ITermOp<B6, R>): PromiseLike<R>; <B1, B2, B3, B4, B5, B6, B7>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>): IPipeableAsyncIterable<B7>; <B1, B2, B3, B4, B5, B6, B7, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, term: ITermOp<B7, R>): PromiseLike<R>; <B1, B2, B3, B4, B5, B6, B7, B8>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, op8: IPipeOp<B7, B8>): IPipeableAsyncIterable<B8>; <B1, B2, B3, B4, B5, B6, B7, B8, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, op8: IPipeOp<B7, B8>, term: ITermOp<B8, R>): PromiseLike<R>; <B1, B2, B3, B4, B5, B6, B7, B8, B9>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, op8: IPipeOp<B7, B8>, op9: IPipeOp<B8, B9>): IPipeableAsyncIterable<B9>; <B1, B2, B3, B4, B5, B6, B7, B8, B9, R>(op1: IPipeOp<T, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, op8: IPipeOp<B7, B8>, op9: IPipeOp<B8, B9>, term: ITermOp<B9, R>): PromiseLike<R>; <TOps extends readonly unknown[], R>(ops: readonly [...TOps], term: ITermOp<TPipeElementOf<T, TOps>, R>): TPipeGroupedTerm<T, TOps, R>; <TOps extends readonly unknown[]>(ops: readonly [...TOps]): TPipeGrouped<T, TOps>; }
```

## `ITermOp<I, R>` (interface)

```text
(source: AsyncIterable<I>): PromiseLike<R>
readonly [TERM_OP_BRAND]: true
```

## `TFlatMapped<R>` (type)

```text
TCallbackValue<R> extends AsyncIterable<infer E> ? E : TCallbackValue<R> extends Iterable<infer E> ? E : never
```

## `TIterPredicate<T>` (type)

```text
(value: T, index: number): unknown
```

## `TIterReducer<T, A>` (type)

```text
(accumulator: A, value: T, index: number): TCallbackResult<A>
```

## `TIterVisitor<T>` (type)

```text
(value: T, index: number): unknown
```

## `concat<TSources extends readonly TAnySource<any>[]>` (function)

```text
<TSources extends readonly TAnySource<any>[]>(...sources: TSources): ICancelablePipeable<TElementOf<TSources[number]>>
<TSources extends readonly TAnySource<any>[]>(...sourcesAndOptions: [...TSources, object]): ICancelablePipeable<TElementOf<TSources[number]>>
```

## `drop<I>` (function)

```text
<I>(count: number): IPipeOp<I, I>
```

## `every<I>` (function)

```text
<I>(predicate: TIterPredicate<I>): ICancelableTermOp<I, boolean>
```

## `filter<I, O extends I>` (function)

```text
<I, O extends I>(predicate: (value: I, index: number) => value is O): IPipeOp<I, O>
<I, R>(predicate: (value: I, index: number) => R): IPipeOp<I, I>
```

## `find<I>` (function)

```text
<I>(predicate: TIterPredicate<I>): ICancelableTermOp<I, I | undefined>
```

## `flatMap<I, R>` (function)

```text
<I, R>(callback: (value: I, index: number) => R): IPipeOp<I, TFlatMapped<R>>
```

## `forEach<I>` (function)

```text
<I>(visitor: TIterVisitor<I>): ICancelableTermOp<I, void>
```

## `from<T>` (function)

```text
<T>(source: AsyncIterable<T>, opts?: object | undefined): ICancelablePipeable<T>
<T>(source: Iterable<PromiseLike<T> | T>, opts?: object | undefined): ICancelablePipeable<T>
<T>(source: PromiseLike<T>, opts?: object | undefined): ICancelablePipeable<T>
```

## `includes<I>` (function)

```text
<I>(searchValue: I): ICancelableTermOp<I, boolean>
```

## `isPipeable` (function)

```text
(value: unknown): value is IPipeableAsyncIterable<any>
```

## `map<I, R>` (function)

```text
<I, R>(callback: (value: I, index: number) => R): IPipeOp<I, TCallbackValue<R>>
```

## `pipe<A>` (function)

```text
<A>(source: TPipeSource<A>): ICancelablePipeable<A>
<A, R>(source: TPipeSource<A>, term: ITermOp<A, R>): CancelablePromise<R, never>
<A, B1>(source: TPipeSource<A>, op1: IPipeOp<A, B1>): ICancelablePipeable<B1>
<A, B1, R>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, term: ITermOp<B1, R>): CancelablePromise<R, never>
<A, B1, B2>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>): ICancelablePipeable<B2>
<A, B1, B2, R>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, term: ITermOp<B2, R>): CancelablePromise<R, never>
<A, B1, B2, B3>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>): ICancelablePipeable<B3>
<A, B1, B2, B3, R>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, term: ITermOp<B3, R>): CancelablePromise<R, never>
<A, B1, B2, B3, B4>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>): ICancelablePipeable<B4>
<A, B1, B2, B3, B4, R>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, term: ITermOp<B4, R>): CancelablePromise<R, never>
<A, B1, B2, B3, B4, B5>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>): ICancelablePipeable<B5>
<A, B1, B2, B3, B4, B5, R>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, term: ITermOp<B5, R>): CancelablePromise<R, never>
<A, B1, B2, B3, B4, B5, B6>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>): ICancelablePipeable<B6>
<A, B1, B2, B3, B4, B5, B6, R>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, term: ITermOp<B6, R>): CancelablePromise<R, never>
<A, B1, B2, B3, B4, B5, B6, B7>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>): ICancelablePipeable<B7>
<A, B1, B2, B3, B4, B5, B6, B7, R>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, term: ITermOp<B7, R>): CancelablePromise<R, never>
<A, B1, B2, B3, B4, B5, B6, B7, B8>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, op8: IPipeOp<B7, B8>): ICancelablePipeable<B8>
<A, B1, B2, B3, B4, B5, B6, B7, B8, R>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, op8: IPipeOp<B7, B8>, term: ITermOp<B8, R>): CancelablePromise<R, never>
<A, B1, B2, B3, B4, B5, B6, B7, B8, B9>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, op8: IPipeOp<B7, B8>, op9: IPipeOp<B8, B9>): ICancelablePipeable<B9>
<A, B1, B2, B3, B4, B5, B6, B7, B8, B9, R>(source: TPipeSource<A>, op1: IPipeOp<A, B1>, op2: IPipeOp<B1, B2>, op3: IPipeOp<B2, B3>, op4: IPipeOp<B3, B4>, op5: IPipeOp<B4, B5>, op6: IPipeOp<B5, B6>, op7: IPipeOp<B6, B7>, op8: IPipeOp<B7, B8>, op9: IPipeOp<B8, B9>, term: ITermOp<B9, R>): CancelablePromise<R, never>
<A, TOps extends readonly unknown[], R>(source: TPipeSource<A>, ops: readonly [...TOps], term: ITermOp<TPipeElementOf<A, TOps>, R>): TCancelableGroupedTerm<A, TOps, R>
<A, TOps extends readonly unknown[]>(source: TPipeSource<A>, ops: readonly [...TOps]): TCancelableGrouped<A, TOps>
```

## `reduce<I, A>` (function)

```text
<I, A>(reducer: TIterReducer<I, A>, initial: A): ICancelableTermOp<I, A>
<I, A = I>(reducer: TIterSeededReducer<I, A>): ICancelableTermOp<I, A>
```

## `some<I>` (function)

```text
<I>(predicate: TIterPredicate<I>): ICancelableTermOp<I, boolean>
```

## `take<I>` (function)

```text
<I>(limit: number): IPipeOp<I, I>
```

## `toArray<I>` (function)

```text
<I>(): ICancelableTermOp<I, Array<I>>
```

## `zip<TSources extends readonly TAnySource<any>[]>` (function)

```text
<TSources extends readonly TAnySource<any>[]>(...sources: TSources): ICancelablePipeable<{ -readonly [K in keyof TSources]: TElementOf<TSources[K]>; }>
<TSources extends readonly TAnySource<any>[]>(...sourcesAndOptions: [...TSources, object]): ICancelablePipeable<{ -readonly [K in keyof TSources]: TElementOf<TSources[K]>; }>
```

## `zipKeyed<T extends Record<string, TAnySource<any>>>` (function)

```text
<T extends Record<string, TAnySource<any>>>(shape: T, opts?: object | undefined): ICancelablePipeable<{ [K in keyof T]: TElementOf<T[K]>; }>
```
