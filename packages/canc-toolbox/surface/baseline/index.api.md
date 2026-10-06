# Public surface: @cancjs/toolbox .

Generated. Do not edit by hand.

- Declarations: `packages/canc-toolbox/dist/types/index.d.ts`
- Exports: 67

## `AbortError` (type)

```text
_cancErrorBrand: any
cause?: unknown
message: string
name: string
stack?: string | undefined
```

## `ICancelableDeferred<T>` (interface)

```text
extends tb.IDeferred<T, ICancelableKind>
cancel: (reason?: any) => void | CancelablePromise<PromiseSettledResult<unknown>[]>
promise: CancelablePromise<T, never>
reject: (reason?: any) => void
resolve: (value: T | PromiseLike<T>) => void
```

## `ICancelableLazyWithResolvers<T>` (interface)

```text
extends ILazyWithResolvers<T, LazyPromise<T>>
cancel: TLazyOnCancel
promise: LazyPromise<T>
reject: (reason?: any) => void
resolve: (value?: T | PromiseLike<T> | undefined) => void
```

## `ICancelifyContext` (interface)

```text
getSignal: TGetSignal
handleCancel: THandleCancel
```

## `ICancelifyOptions` (interface)

```text
extends ICancelablePromiseOptions
AbortController?: AbortControllerCtor | undefined
displayName?: string | undefined
```

## `ICatchErrorFn<M extends readonly TErrorMatcher[] = readonly TErrorMatcher[]>` (interface)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | MatchedError<M[number]>, Exclude<TFailure, SubtractedError<M[number]>>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | MatchedError<M[number]>, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): [Extract<TError, MatchedError<M[number]>>] extends [never] ? MatchedError<M[number]> : Extract<TError, MatchedError<M[number]>>
```

## `IDebounceOptions` (type)

```text
AbortController?: TAbortControllerCtor | undefined
TimeoutError?: ICancErrorConstructor<"TimeoutError", "@cancjs/promise:TimeoutError"> | undefined
clearTimeout?: ((handle: any) => void) | undefined
lazy?: undefined
leading?: boolean | undefined
maxWait?: number | undefined
setTimeout?: ((handler: () => void, ms?: number) => any) | undefined
trailing?: boolean | undefined
```

## `IDebounced<Args extends unknown[], R, K extends IPromiseKind = IPromiseLikeKind, F = never>` (interface)

```text
(...args: Args): TPromiseOf<K, R, F>
cancel: (reason?: any) => void
flush: () => TPromiseOf<K, R, F> | undefined
readonly isPending: boolean
```

## `IDeferred<T, K extends IPromiseKind = IPromiseLikeKind, F = never>` (interface)

```text
promise: TPromiseOf<K, T, F>
reject: (reason?: any) => void
resolve: (value: T | PromiseLike<T>) => void
```

## `IExecutorCtx` (interface)

```text
getSignal?: (() => any) | undefined
handleCancel: THandleCancel
```

## `ILazyPromiseOptions` (interface)

```text
extends ICancelablePromiseOptions, IPromiseImplOptions
resettable?: boolean | undefined
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

## `IPromisifyAllOptions` (interface)

```text
extends IPromisifyOptions
AbortController?: TAbortControllerCtor | undefined
custom?: boolean | undefined
displayName?: string | undefined
errorFirst?: boolean | undefined
exclude?: Array<string | RegExp> | undefined
excludeMain?: boolean | undefined
handleCancel?: ((handle: any, args: any[], getSignal: TGetSignal, reason?: any) => void) | undefined
include?: Array<string | RegExp> | undefined
lazy?: boolean | undefined
mode?: "clone" | "merge" | "overwrite" | undefined
multiArgs?: boolean | Array<string> | undefined
signal?: IAbortSignalLike | Array<IAbortSignalLike> | undefined
suffix?: string | undefined
transformArgs?: ((args: any[], getSignal: TGetSignal) => any[]) | undefined
transformName?: ((name: string) => string) | undefined
```

## `IPromisifyOptions` (interface)

```text
AbortController?: TAbortControllerCtor | undefined
custom?: boolean | undefined
displayName?: string | undefined
errorFirst?: boolean | undefined
handleCancel?: ((handle: any, args: any[], getSignal: TGetSignal, reason?: any) => void) | undefined
lazy?: boolean | undefined
multiArgs?: boolean | Array<string> | undefined
signal?: IAbortSignalLike | Array<IAbortSignalLike> | undefined
transformArgs?: ((args: any[], getSignal: TGetSignal) => any[]) | undefined
```

## `IRetryOptions<K extends IPromiseKind = IPromiseLikeKind>` (type)

```text
AbortController?: TAbortControllerCtor | undefined
TimeoutError?: ICancErrorConstructor<"TimeoutError", "@cancjs/promise:TimeoutError"> | undefined
clearTimeout?: ((handle: any) => void) | undefined
delay?: ((ctx: IRetryContext & { computedDelay: number; }) => number | undefined) | undefined
factor?: number | undefined
initialDelay?: number | undefined
jitter?: number | boolean | undefined
lazy?: boolean | undefined
maxDelay?: number | undefined
maxTimeout?: number | undefined
minTimeout?: number | undefined
onRetry?: ((reason: any, attempt: number, delay: number) => void) | undefined
retries?: number | undefined
setTimeout?: ((handler: () => void, ms?: number) => any) | undefined
shouldRetry?: ((reason: any, ctx: IRetryContext) => boolean | PromiseLike<boolean>) | undefined
```

## `ISuppressErrorFn<M extends readonly TErrorMatcher[] = readonly TErrorMatcher[]>` (interface)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<void | TResult, Exclude<TFailure, SubtractedError<M[number]>>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<void | TResult, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): void
```

## `IThrottleOptions` (type)

```text
AbortController?: TAbortControllerCtor | undefined
TimeoutError?: ICancErrorConstructor<"TimeoutError", "@cancjs/promise:TimeoutError"> | undefined
clearTimeout?: ((handle: any) => void) | undefined
lazy?: undefined
leading?: boolean | undefined
setTimeout?: ((handler: () => void, ms?: number) => any) | undefined
trailing?: boolean | undefined
```

## `IThrottled<Args extends unknown[], R, K extends IPromiseKind = IPromiseLikeKind, F = never>` (type)

```text
(...args: Args): TPromiseOf<K, R, F>
cancel: (reason?: any) => void
flush: () => TPromiseOf<K, R, F> | undefined
readonly isPending: boolean
```

## `IToolboxOptions` (interface)

```text
extends ICancelablePromiseOptions
lazy?: boolean | undefined
```

## `IWaitForOptions` (type)

```text
AbortController?: TAbortControllerCtor | undefined
TimeoutError?: ICancErrorConstructor<"TimeoutError", "@cancjs/promise:TimeoutError"> | undefined
clearTimeout?: ((handle: any) => void) | undefined
interval?: number | undefined
lazy?: boolean | undefined
setTimeout?: ((handler: () => void, ms?: number) => any) | undefined
timeout?: number | undefined
```

## `LazyPromise<T = any>` (class)

```text
extends LazyBase<T>
new <T = any>(executor: TLazyExecutor<T>, options?: ILazyPromiseOptions | undefined): LazyPromise<T>
static _new: <V>(executor: TLazyExecutor<V>, options?: object) => LazyBase<V>
static _optionsChanged: (instance: LazyBase<any>, options?: object) => boolean
static all: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V[]>
static allSettled: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<PromiseSettledResult<Awaited<V>>[]>
static any: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V>
static race: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V>
static reject: <V = never>(reason?: any, options?: ILazyPromiseOptions) => LazyPromise<V>
static resolve: <V>(value?: V | PromiseLike<V>, options?: ILazyPromiseOptions) => LazyPromise<V>
static try: <V, TArgs extends any[]>(fn: (...args: TArgs) => V | PromiseLike<V>, ...args: TArgs) => LazyPromise<V>
static withResolvers: <V>(options?: ILazyPromiseOptions) => ICancelableLazyWithResolvers<V>
readonly [LAZY_PROMISE_BRAND]: true
_afterSubscribe: () => void
_beforeSubscribe: () => PromiseLike<T> | undefined
_cancelError?: CancelError | undefined
_canceledBeforeStart: boolean
_consumers: number
_executor: TLazyExecutor<T>
_inner?: TInnerPromise<T> | undefined
_isStartable: () => boolean
_options?: ILazyPromiseOptions | undefined
_reset: () => void
_resettable: boolean
_resolveImpl: () => TPromiseCtor
_resolveImplStatics: () => ILazyImplStatics
_runTeardowns: (reason?: any) => void
_start: () => PromiseLike<T>
_state: TLazyState
_teardowns: Array<TLazyOnCancel>
cancel: (reason?: any) => void
catch: <TResult = never>(onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null | undefined) => PromiseLike<T | TResult>
execute: () => void
finally: (onFinally?: (() => void) | null) => PromiseLike<T>
started: boolean
then: <TResult1 = T, TResult2 = never>(onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null | undefined, onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null | undefined) => PromiseLike<TResult1 | TResult2>
```

## `SupersededError` (type)

```text
message: string
name: string
```

## `TCallbackFn` (type)

```text
(...args: Array<any>): any
```

## `TCancelifyFn<A extends any[], R>` (type)

```text
(ctx: ICancelifyContext, ...args: A): R | PromiseLike<R>
```

## `TDuration` (type)

```text
toLocaleString: { (locales?: string | string[], options?: Intl.NumberFormatOptions): string; (locales?: Intl.LocalesArgument, options?: Intl.NumberFormatOptions): string; } | { (): string; (locales: string | string[], options?: Intl.NumberFormatOptions & Intl.DateTimeFormatOptions): string; }
toString: ((radix?: number) => string) | (() => string)
valueOf: (() => number) | (() => Object)
```

## `TEagerToolboxOptions` (type)

```text
asyncCancel?: boolean | undefined
bubble?: boolean | undefined
forceCancelable?: boolean | undefined
shield?: boolean | undefined
signal?: IAbortSignal | Array<IAbortSignal> | undefined
strict?: boolean | undefined
```

## `TErrorConstructor` (type)

```text
new (...args: Array<any>): any
```

## `TErrorMatcher` (type)

```text
readonly length: number
toString: (() => string) | (() => string)
valueOf: (() => Object) | (() => string)
```

## `TErrorPredicate` (type)

```text
(error: any): boolean
```

## `THandleCancel` (type)

```text
(onCancel: (reason?: any) => void): void
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

## `TToolboxExecutor<T>` (type)

```text
(resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void, ctx?: IExecutorCtx | undefined): void
```

## `TimeoutError` (type)

```text
_cancErrorBrand: any
cause?: unknown
message: string
name: string
stack?: string | undefined
```

## `cancelify<A extends any[], R>` (function)

```text
<A extends any[], R>(fn: TCancelifyFn<A, R>, options?: ICancelifyOptions | undefined): (...callArgs: A) => CancelablePromise<R, never>
```

## `catchAbort` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }) | TResult, Exclude<TFailure, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }) | TResult, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): [Extract<TError, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }>] extends [never] ? ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; } : Extract<TError, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }>
```

## `catchTimeout` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }), Exclude<TFailure, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }), never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): [Extract<TError, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>] extends [never] ? ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; } : Extract<TError, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>
```

## `createAbortSignal` (function)

```text
(): { signal: AbortSignal; abort: (reason?: unknown) => void; }
```

## `createCatchError<M extends readonly TErrorMatcher[]>` (function)

```text
<M extends readonly TErrorMatcher[]>(...matchers: M): ICatchErrorFn<M>
```

## `createLazyPromise<T = any>` (function)

```text
<T = any>(value: T | PromiseLike<T> | (() => T | PromiseLike<T>), options?: ILazyPromiseOptions | undefined): LazyPromise<T>
```

## `createSuppressError<M extends readonly TErrorMatcher[]>` (function)

```text
<M extends readonly TErrorMatcher[]>(...matchers: M): ISuppressErrorFn<M>
```

## `debounce` (const)

```text
<Args extends unknown[], R, F = never>(fn: (...args: Args) => R | CancelablePromise<R, F> | PromiseLike<R>, ms: number, options?: IDebounceOptions | undefined): IDebounced<Args, R, ICancelableKind, F>
```

## `defer` (const)

```text
<T = void>(options?: TEagerToolboxOptions | undefined): ICancelableDeferred<T>
```

## `delay` (const)

```text
<T = void>(ms: TDuration, options?: (IToolboxOptions & TCallDeps) | undefined): CancelablePromise<T, never>
<T, F = never>(input: TTimedInput<T, ICancelableKind, F>, ms: TDuration, options?: (IToolboxOptions & TCallDeps) | undefined): CancelablePromise<T, F>
```

## `fromAbortSignal` (const)

```text
(signal: IAbortSignalLike, options?: TEagerToolboxOptions | undefined): CancelablePromise<void, never>
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
<T = any>(executor: TLazyExecutor<T>, options?: ILazyPromiseOptions | undefined): LazyPromise<T>
```

## `limit` (const)

```text
(concurrency: number): ILimited<ICancelableKind>
```

## `map` (const)

```text
<T, R>(input: Iterable<T>, mapper: TMapper<T, R>, options?: IMapOptions | undefined): CancelablePromise<Array<R>, never>
```

## `minDelay` (const)

```text
<T, F = never>(input: TTimedInput<T, ICancelableKind, F>, ms: TDuration, options?: TEagerToolboxOptions | undefined): CancelablePromise<T, F>
```

## `promisify` (const)

```text
(fn: TCallbackFn, options?: IPromisifyOptions | undefined): (...args: Array<any>) => CancelablePromise<any, never>
```

## `promisifyAll` (const)

```text
<T extends object>(source: T, options?: IPromisifyAllOptions | undefined): any
```

## `retry` (const)

```text
<T, F = never>(input: (attempt: number) => T | CancelablePromise<T, F> | PromiseLike<T>, options?: IRetryOptions<ICancelableKind> | undefined): CancelablePromise<T, F>
```

## `suppressAbort` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<void | TResult, Exclude<TFailure, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<void | TResult, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): void
```

## `suppressTimeout` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<void | TResult, Exclude<TFailure, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<void | TResult, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): void
```

## `throttle` (const)

```text
<Args extends unknown[], R, F = never>(fn: (...args: Args) => R | CancelablePromise<R, F> | PromiseLike<R>, ms: number, options?: IThrottleOptions | undefined): IThrottled<Args, R, ICancelableKind, F>
```

## `timeout` (const)

```text
(ms: TDuration, options?: (IToolboxOptions & TCallDeps) | undefined): CancelablePromise<never, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>
<T, F = never>(input: TTimedInput<T>, ms?: TDuration | undefined, options?: (IToolboxOptions & TCallDeps) | undefined): CancelablePromise<T, F | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; })>
```

## `toAbortSignal` (function)

```text
(promise: PromiseLike<unknown>): AbortSignal
```

## `waitFor` (const)

```text
(condition: () => unknown, options?: IWaitForOptions | undefined): CancelablePromise<void, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>
```

## `withSignal<T>` (function)

```text
<T>(signal: AbortSignal | undefined, promiseOrFn: T | ((signal?: AbortSignal | undefined) => T | PromiseLike<T>) | PromiseLike<T>): Promise<T>
```
