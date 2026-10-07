# Public surface: @cancjs/toolbox-native .

Generated. Do not edit by hand.

- Declarations: `packages/canc-toolbox-native/dist/types/index.d.ts`
- Exports: 47

## `AbortError` (type)

```text
_cancErrorBrand: any
message: string
name: string
```

## `ICatchErrorFn` (type)

```text
<T>(promise: PromiseLike<T>): Promise<T | Error>
<TError>(error: TError): TError
```

## `IDebounceOptions` (type)

```text
TTimersOverride & { AbortController?: TAbortControllerCtor; TimeoutError?: typeof TimeoutError; }
lazy?: undefined
leading?: boolean | undefined
maxWait?: number | undefined
trailing?: boolean | undefined
```

## `IDebounced<Args extends unknown[], R, K extends IPromiseKind = IPromiseLikeKind, F = never>` (interface)

```text
(...args: Args): TPromiseOf<K, R, F>
cancel: (reason?: any) => void
flush: () => TPromiseOf<K, R, F> | undefined
readonly isPending: boolean
```

## `ILazyPromiseOptions` (type)

```text
signal?: IAbortSignalLike | Array<IAbortSignalLike> | undefined
```

## `ILazyWithResolvers<T, TPromise extends PromiseLike<T> = LazyBase<T>>` (interface)

```text
promise: TPromise
reject: (reason?: any) => void
resolve: (value?: T | PromiseLike<T>) => void
```

## `ILimited<K extends IPromiseKind = IPromiseLikeKind>` (interface)

```text
<T, Args extends unknown[]>(fn: (...args: Args) => T | PromiseLike<T>, ...args: Args): TPromiseOf<K, T>
readonly active: number
cancel: (reason?: any) => void
concurrency: number
readonly pending: number
```

## `IMapOptions` (interface)

```text
concurrency?: number | undefined
stopOnError?: boolean | undefined
```

## `ISuppressErrorFn` (type)

```text
<T>(promise: PromiseLike<T>): Promise<void | T>
<TError>(error: TError): void
```

## `IThrottleOptions` (type)

```text
TTimersOverride & { AbortController?: TAbortControllerCtor; TimeoutError?: typeof TimeoutError; }
lazy?: undefined
leading?: boolean | undefined
trailing?: boolean | undefined
```

## `IThrottled<Args extends unknown[], R, K extends IPromiseKind = IPromiseLikeKind, F = never>` (type)

```text
(...args: Args): TPromiseOf<K, R, F>
cancel: (reason?: any) => void
flush: () => TPromiseOf<K, R, F> | undefined
readonly isPending: boolean
```

## `LazyPromise<T = any>` (class)

```text
extends LazyBase<T>
new <T = any>(executor: TLazyExecutor<T>, options?: object | undefined): LazyPromise<T>
static _new: <V>(executor: TLazyExecutor<V>, options?: object) => LazyBase<V>
static _optionsChanged: (instance: LazyBase<any>, options?: object) => boolean
static all: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V[]>
static allSettled: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<PromiseSettledResult<Awaited<V>>[]>
static any: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V>
static race: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V>
static reject: <V = never>(reason?: any, options?: ILazyPromiseOptions) => LazyPromise<V>
static resolve: <V>(value?: V | PromiseLike<V>, options?: ILazyPromiseOptions) => LazyPromise<V>
static try: <V, TArgs extends any[]>(fn: (...args: TArgs) => V | PromiseLike<V>, ...args: TArgs) => LazyPromise<V>
static withResolvers: <V>(options?: ILazyPromiseOptions) => ILazyWithResolvers<V, LazyPromise<V>>
readonly [LAZY_PROMISE_BRAND]: true
_afterSubscribe: () => void
_beforeSubscribe: () => PromiseLike<T> | undefined
_executor: TLazyExecutor<T>
_inner?: TInnerPromise<T> | undefined
_isStartable: () => boolean
_options?: IAbortSignalOptions | undefined
_resolveImpl: () => TPromiseCtor
_resolveImplStatics: () => ILazyImplStatics
_runTeardowns: (reason?: any) => void
_start: () => PromiseLike<T>
_state: TLazyState
_teardowns: Array<TLazyOnCancel>
catch: <TResult = never>(onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined) => PromiseLike<T | TResult>
execute: () => void
finally: (onFinally?: (() => void) | null) => PromiseLike<T>
started: boolean
then: <TResult1 = T, TResult2 = never>(onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined, onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined) => PromiseLike<TResult1 | TResult2>
```

## `SupersededError` (type)

```text
_cancErrorBrand: any
message: string
name: string
```

## `TDuration` (type)

```text
number | [min: number, max: number]
```

## `TErrorConstructor` (type)

```text
new (...args: Array<any>): any
```

## `TErrorMatcher` (type)

```text
string | TErrorConstructor | TErrorPredicate
```

## `TErrorPredicate` (type)

```text
(error: any): boolean
```

## `TLazyExecutor<T>` (type)

```text
(resolve: (value?: T | PromiseLike<T> | undefined) => void, reject: (reason?: any) => void, handleCancel: (onCancel: TLazyOnCancel) => void): void | TLazyOnCancel
```

## `TLazyOnCancel` (type)

```text
(reason?: any): void
```

## `TMapper<T, R>` (type)

```text
(item: T, index: number): R | PromiseLike<R>
```

## `TTimedInput<T, K extends IPromiseKind = IPromiseLikeKind, F = never>` (type)

```text
T | TPromiseOf<K, T, F> | PromiseLike<T> | (() => T | TPromiseOf<K, T, F> | PromiseLike<T>)
```

## `TimeoutError` (type)

```text
_cancErrorBrand: any
message: string
name: string
```

## `catchAbort` (const)

```text
<T>(promise: PromiseLike<T>): Promise<T | Error>
<TError>(error: TError): TError
```

## `catchTimeout` (const)

```text
<T>(promise: PromiseLike<T>): Promise<T | Error>
<TError>(error: TError): TError
```

## `createCatchError` (const)

```text
(...matchers: Array<TErrorMatcher>): ICatchErrorFn
```

## `createLazyPromise<T = any>` (function)

```text
<T = any>(value: T | PromiseLike<T> | (() => T | PromiseLike<T>), options?: IAbortSignalOptions | undefined): LazyPromise<T>
```

## `createSuppressError` (const)

```text
(...matchers: Array<TErrorMatcher>): ISuppressErrorFn
```

## `debounce` (const)

```text
<Args extends unknown[], R, F = never>(fn: (...args: Args) => R | PromiseLike<R>, ms: number, options?: IDebounceOptions | undefined): IDebounced<Args, R, IPromiseLikeKind, F>
```

## `defer` (const)

```text
<T = void>(options?: INoLazy | undefined): IDeferred<T, INativeKind, never>
```

## `delay` (const)

```text
<T = void>(ms: TDuration, options?: (INativeOptions & TCallDeps) | undefined): Promise<T>
<T, F = never>(input: TTimedInput<T, INativeKind, F>, ms: TDuration, options?: (INativeOptions & TCallDeps) | undefined): Promise<T>
```

## `fromAbortSignal` (const)

```text
(signal: IAbortSignalLike, options?: INativeOptions | undefined): Promise<void>
```

## `isAbortError` (const)

```text
(error: any): error is ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }
```

## `isLazyPromise<T = any>` (function)

```text
<T = any>(value: unknown): value is LazyBase<T>
```

## `isSupersededError` (const)

```text
(error: any): error is ICancError & { readonly _cancErrorBrand: "@cancjs/toolbox:SupersededError"; }
```

## `isTimeoutError` (const)

```text
(error: any): error is ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }
```

## `lazy<T = any>` (function)

```text
<T = any>(executor: TLazyExecutor<T>, options?: IAbortSignalOptions | undefined): LazyPromise<T>
```

## `limit` (const)

```text
(concurrency: number): ILimited<INativeKind>
```

## `map` (const)

```text
<T, R>(input: Iterable<T>, mapper: TMapper<T, R>, options?: IMapOptions | undefined): Promise<Array<R>>
```

## `minDelay` (const)

```text
<T>(input: TTimedInput<T>, ms: TDuration, options?: INoLazy | undefined): Promise<T>
```

## `promisify` (const)

```text
(fn: TCallbackFn, options?: IPromisifyOptions | undefined): (...args: Array<any>) => Promise<any>
```

## `promisifyAll` (const)

```text
<T extends object>(source: T, options?: IPromisifyAllOptions | undefined): any
```

## `retry` (const)

```text
<T, F = never>(input: (attempt: number) => T | Promise<T> | PromiseLike<T>, options?: IRetryOptions<INativeKind> | undefined): Promise<T>
```

## `suppressAbort` (const)

```text
<T>(promise: PromiseLike<T>): Promise<void | T>
<TError>(error: TError): void
```

## `suppressTimeout` (const)

```text
<T>(promise: PromiseLike<T>): Promise<void | T>
<TError>(error: TError): void
```

## `throttle` (const)

```text
<Args extends unknown[], R, F = never>(fn: (...args: Args) => R | PromiseLike<R>, ms: number, options?: IThrottleOptions | undefined): IThrottled<Args, R, IPromiseLikeKind, F>
```

## `timeout` (const)

```text
(ms: TDuration, options?: (INativeOptions & TCallDeps) | undefined): Promise<never>
<T, F = never>(input: TTimedInput<T>, ms?: TDuration | undefined, options?: (INativeOptions & TCallDeps) | undefined): Promise<T>
```

## `waitFor` (const)

```text
(condition: () => unknown, options?: IWaitForOptions | undefined): Promise<void>
```
