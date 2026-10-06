# Public surface: @cancjs/coroutine .

Generated. Do not edit by hand.

- Declarations: `packages/canc-coroutine/dist/types/index.d.ts`
- Exports: 20

## `AsyncResult<TResult = void, TFailure = unknown>` (type)

```text
[iterator]: () => Generator<unknown extends TFailure ? unknown : TPrimitiveYield | Failing<TFailure>, TResult, any>
next: (...[value]: [] | [any]) => IteratorResult<unknown extends TFailure ? unknown : TPrimitiveYield | Failing<TFailure>, TResult>
return: (value: TResult) => IteratorResult<unknown extends TFailure ? unknown : TPrimitiveYield | Failing<TFailure>, TResult>
throw: (e: any) => IteratorResult<unknown extends TFailure ? unknown : TPrimitiveYield | Failing<TFailure>, TResult>
```

## `BreakError` (class)

```text
extends Error
new (message?: string | undefined): BreakError
readonly [BREAK_ERROR_BRAND]: true
name: "BreakError"
```

## `ICancForAwaitLoop<T>` (interface)

```text
[iterator]: () => Iterator<T>
next: () => Generator<unknown, void, any>
return: () => Generator<unknown, void, any>
```

## `IGeneratorLikeFn<TThis = any>` (interface)

```text
extends IFn
(this: TThis, ...args: Array<any>): TGeneratorLike<unknown, any, unknown>
(...args: Array<any>): any
displayName?: string | undefined
```

## `IterationError` (type)

```text
message: string
name: string
```

## `TCoroutineOptions` (type)

```text
displayName?: string | undefined
```

## `TEachSource<T>` (type)

```text
AsyncIterable<T> | Iterable<T | Promise<T>>
```

## `TForAwaitCallback<T>` (type)

```text
(value: T, index: number): false | void | Generator<unknown, false | void, any> | CancelablePromise<false | void, never>
```

## `TGeneratorLike<PYield = unknown, PReturn = any, PNext = unknown>` (type)

```text
next: (...[value]: [] | [PNext]) => IteratorResult<PYield, PReturn>
return: (value: PReturn) => IteratorResult<PYield, PReturn>
throw: (e: any) => IteratorResult<PYield, PReturn>
```

## `async<TFn extends IGeneratorLikeFn<TThis>, TArgs extends any[] = Parameters<TFn>, TReturn = TCoroutineReturn<TFn>, TThis = any, TFailure = FailureOf<TCoroutineYield<TFn>>>` (function)

```text
<TFn extends IGeneratorLikeFn<TThis>, TArgs extends any[] = Parameters<TFn>, TReturn = Awaited<ReturnType<TFn> extends Generator<infer _Y, infer R, infer _N> ? R : never>, TThis = any, TFailure = FailureOf<TCoroutineYield<TFn, ReturnType<TFn>>>>(genFn: TFn, ctx?: TThis | undefined, options?: TCoroutineOptions | undefined): (this: any, ...args: TArgs) => CancelablePromise<TReturn, TFailure>
```

## `asyncMethod<T>` (function)

```text
<T>(instance: T, key: keyof T & string, options?: TCoroutineOptions | undefined): void
```

## `await` (const)

```text
<T>(value: T): Generator<T, Awaited<T>, any>
all: ICancAwaitAll
allSettled: ICancAwaitAllSettled
any: ICancAwaitAny
race: ICancAwaitRace
try: ICancAwaitTry
```

## `bindMethod<T>` (function)

```text
<T>(instance: T, key: keyof T & string): void
```

## `cancAsync<TFn extends IGeneratorLikeFn<TThis>, TArgs extends any[] = Parameters<TFn>, TReturn = TCoroutineReturn<TFn>, TThis = any, TFailure = FailureOf<TCoroutineYield<TFn>>>` (function)

```text
<TFn extends IGeneratorLikeFn<TThis>, TArgs extends any[] = Parameters<TFn>, TReturn = Awaited<ReturnType<TFn> extends Generator<infer _Y, infer R, infer _N> ? R : never>, TThis = any, TFailure = FailureOf<TCoroutineYield<TFn, ReturnType<TFn>>>>(genFn: TFn, ctx?: TThis | undefined, options?: TCoroutineOptions | undefined): (this: any, ...args: TArgs) => CancelablePromise<TReturn, TFailure>
```

## `cancAwait` (const)

```text
<T>(value: T): Generator<T, Awaited<T>, any>
all: ICancAwaitAll
allSettled: ICancAwaitAllSettled
any: ICancAwaitAny
race: ICancAwaitRace
try: ICancAwaitTry
```

## `cancForAwait` (const)

```text
<T>(source: TEachSource<T>): Generator<unknown, ICancForAwaitLoop<T>, any>
<T>(source: TEachSource<T>, cb: TForAwaitCallback<T>): Generator<Failing<BreakError>, void, any>
next: () => Generator<unknown, void, any>
toArray: <T>(source: TEachSource<T>) => Generator<Failing<BreakError>, T[], any>
```

## `cancThrow<TFailure>` (function)

```text
<TFailure>(error: TFailure): Generator<Failing<TFailure>, never, any>
```

## `forAwait` (const)

```text
<T>(source: TEachSource<T>): Generator<unknown, ICancForAwaitLoop<T>, any>
<T>(source: TEachSource<T>, cb: TForAwaitCallback<T>): Generator<Failing<BreakError>, void, any>
next: () => Generator<unknown, void, any>
toArray: <T>(source: TEachSource<T>) => Generator<Failing<BreakError>, T[], any>
```

## `isBreakError` (function)

```text
(value: unknown): value is BreakError
```

## `throw<TFailure>` (function)

```text
<TFailure>(error: TFailure): Generator<Failing<TFailure>, never, any>
```
