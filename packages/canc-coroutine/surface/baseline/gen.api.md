# Public surface: @cancjs/coroutine ./gen

Generated. Do not edit by hand.

- Declarations: `packages/canc-coroutine/dist/types/gen.d.ts`
- Exports: 12

## `AsyncGenResult<TEmit, TReturn = void, TFailure = unknown>` (type)

```text
[iterator]: () => Generator<(unknown extends TFailure ? TAwaited<any> : Failing<TFailure> & TAwaited<any>) | TEmit, TReturn, any>
next: (...[value]: [] | [any]) => IteratorResult<(unknown extends TFailure ? TAwaited<any> : Failing<TFailure> & TAwaited<any>) | TEmit, TReturn>
return: (value: TReturn) => IteratorResult<(unknown extends TFailure ? TAwaited<any> : Failing<TFailure> & TAwaited<any>) | TEmit, TReturn>
throw: (e: any) => IteratorResult<(unknown extends TFailure ? TAwaited<any> : Failing<TFailure> & TAwaited<any>) | TEmit, TReturn>
```

## `ICancAsyncGenerator<T, TReturn = any, TNext = any, TFailure = never>` (interface)

```text
extends AsyncGenerator<T, TReturn, TNext>
readonly [FAILURE]?: TFailure | undefined
```

## `async<TYield, TReturn, TArgs extends any[], TThis = any>` (function)

```text
<TYield, TReturn, TArgs extends any[], TThis = any>(genFn: (this: TThis, ...args: TArgs) => Generator<TYield, TReturn, any>, options?: TCancelableCoroutineGenOptions | undefined): (this: TThis, ...args: TArgs) => ICancAsyncGenerator<Exclude<TYield, TAwaited<any>>, TReturn, any, FailureOf<TYield>>
(genFn: IGeneratorLikeFn<any>, options?: TCancelableCoroutineGenOptions | undefined): (...args: Array<any>) => ICancAsyncGenerator<any, any, any, never>
```

## `await` (const)

```text
<T>(value: T): Generator<Failing<FailureOf<T>> & TAwaited<Awaited<T>>, Awaited<T>, any>
all: ICancGenAwaitAll
allSettled: ICancGenAwaitAllSettled
any: ICancGenAwaitAny
race: ICancGenAwaitRace
try: ICancGenAwaitTry
```

## `cancGenAsync<TYield, TReturn, TArgs extends any[], TThis = any>` (function)

```text
<TYield, TReturn, TArgs extends any[], TThis = any>(genFn: (this: TThis, ...args: TArgs) => Generator<TYield, TReturn, any>, options?: TCancelableCoroutineGenOptions | undefined): (this: TThis, ...args: TArgs) => ICancAsyncGenerator<Exclude<TYield, TAwaited<any>>, TReturn, any, FailureOf<TYield>>
(genFn: IGeneratorLikeFn<any>, options?: TCancelableCoroutineGenOptions | undefined): (...args: Array<any>) => ICancAsyncGenerator<any, any, any, never>
```

## `cancGenAwait` (const)

```text
<T>(value: T): Generator<Failing<FailureOf<T>> & TAwaited<Awaited<T>>, Awaited<T>, any>
all: ICancGenAwaitAll
allSettled: ICancGenAwaitAllSettled
any: ICancGenAwaitAny
race: ICancGenAwaitRace
try: ICancGenAwaitTry
```

## `cancGenDelegate<T>` (function)

```text
<T>(source: TEachSource<T>): Generator<(Failing<BreakError> & TAwaited<any>) | T, void, any>
```

## `cancGenForAwait` (const)

```text
<T>(source: TEachSource<T>, cb: TForAwaitCallback<T>): Generator<Failing<BreakError> & TAwaited<any>, void, any>
toArray: <T>(source: TEachSource<T>) => Generator<Failing<BreakError> & TAwaited<any>, T[], any>
```

## `cancGenThrow<TFailure>` (function)

```text
<TFailure>(error: TFailure): Generator<Failing<TFailure> & TAwaited<never>, never, any>
```

## `delegate<T>` (function)

```text
<T>(source: TEachSource<T>): Generator<(Failing<BreakError> & TAwaited<any>) | T, void, any>
```

## `forAwait` (const)

```text
<T>(source: TEachSource<T>, cb: TForAwaitCallback<T>): Generator<Failing<BreakError> & TAwaited<any>, void, any>
toArray: <T>(source: TEachSource<T>) => Generator<Failing<BreakError> & TAwaited<any>, T[], any>
```

## `throw<TFailure>` (function)

```text
<TFailure>(error: TFailure): Generator<Failing<TFailure> & TAwaited<never>, never, any>
```
