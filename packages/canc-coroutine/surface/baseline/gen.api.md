# Public surface: @cancjs/coroutine ./gen

Generated. Do not edit by hand.

- Declarations: `packages/canc-coroutine/dist/types/gen.d.ts`
- Exports: 12

## `AsyncGenResult<TEmit, TReturn = void, TFailure = unknown>` (type)

```text
[iterator]: () => Generator<TEmit | (unknown extends TFailure ? TAwaited<any> : TAwaited<any> & Failing<TFailure>), TReturn, any>
next: (...[value]: [] | [any]) => IteratorResult<TEmit | (unknown extends TFailure ? TAwaited<any> : TAwaited<any> & Failing<TFailure>), TReturn>
return: (value: TReturn) => IteratorResult<TEmit | (unknown extends TFailure ? TAwaited<any> : TAwaited<any> & Failing<TFailure>), TReturn>
throw: (e: any) => IteratorResult<TEmit | (unknown extends TFailure ? TAwaited<any> : TAwaited<any> & Failing<TFailure>), TReturn>
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
<T>(value: T): Generator<TAwaited<Awaited<T>> & Failing<FailureOf<T>>, Awaited<T>, any>
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
<T>(value: T): Generator<TAwaited<Awaited<T>> & Failing<FailureOf<T>>, Awaited<T>, any>
all: ICancGenAwaitAll
allSettled: ICancGenAwaitAllSettled
any: ICancGenAwaitAny
race: ICancGenAwaitRace
try: ICancGenAwaitTry
```

## `cancGenDelegate<T>` (function)

```text
<T>(source: TEachSource<T>): Generator<T | (TAwaited<any> & Failing<BreakError>), void, any>
```

## `cancGenForAwait` (const)

```text
<T>(source: TEachSource<T>, cb: TForAwaitCallback<T>): Generator<TAwaited<any> & Failing<BreakError>, void, any>
toArray: <T>(source: TEachSource<T>) => Generator<TAwaited<any> & Failing<BreakError>, T[], any>
```

## `cancGenThrow<TFailure>` (function)

```text
<TFailure>(error: TFailure): Generator<TAwaited<never> & Failing<TFailure>, never, any>
```

## `delegate<T>` (function)

```text
<T>(source: TEachSource<T>): Generator<T | (TAwaited<any> & Failing<BreakError>), void, any>
```

## `forAwait` (const)

```text
<T>(source: TEachSource<T>, cb: TForAwaitCallback<T>): Generator<TAwaited<any> & Failing<BreakError>, void, any>
toArray: <T>(source: TEachSource<T>) => Generator<TAwaited<any> & Failing<BreakError>, T[], any>
```

## `throw<TFailure>` (function)

```text
<TFailure>(error: TFailure): Generator<TAwaited<never> & Failing<TFailure>, never, any>
```
