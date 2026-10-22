# Public surface: @cancjs/toolbox .

Generated. Do not edit by hand.

- Declarations: `packages/canc-toolbox/dist/types/index.d.ts`
- Exports: 67

## `AbortError` (type)

```text
_cancErrorBrand: "@cancjs/promise:AbortError"
cause?: unknown
message: string
name: string
stack?: string | undefined
```

## `ICancelableDeferred<T>` (interface)

```text
extends tb.IDeferred<T, ICancelableKind>
cancel: (reason?: any) => CancelablePromise<ISettledResult<unknown>[], never> | void
promise: CancelablePromise<T, never>
reject: (reason?: any) => void
resolve: (value: PromiseLike<T> | T) => void
```

## `ICancelableLazyWithResolvers<T>` (interface)

```text
extends ILazyWithResolvers<T, LazyPromise<T>>
cancel: TLazyOnCancel
promise: LazyPromise<T, unknown>
reject: (reason?: any) => void
resolve: (value?: PromiseLike<T> | T | undefined) => void
```

## `ICancelifyContext` (interface)

```text
getSignal: () => any // @deprecated
handleCancel: THandleCancel
readonly signal: any
```

## `ICancelifyOptions` (interface)

```text
extends ICancelablePromiseOptions
AbortController?: AbortControllerCtor | undefined
displayName?: string | undefined
```

## `ICatchErrorFn<M extends readonly TErrorMatcher[] = readonly TErrorMatcher[]>` (interface)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<MatchedError<M[number]> | TResult, Exclude<TFailure, SubtractedError<M[number]>>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<MatchedError<M[number]> | TResult, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): [Extract<TError, MatchedError<M[number]>>] extends [never] ? MatchedError<M[number]> : Extract<TError, MatchedError<M[number]>>
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

## `IDeferred<T, K extends IPromiseKind = IPromiseLikeKind, F = never>` (interface)

```text
promise: TPromiseOf<K, T, F>
reject: (reason?: any) => void
resolve: (value: PromiseLike<T> | T) => void
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
resolve: (value?: PromiseLike<T> | T) => void
```

## `ILimited<K extends IPromiseKind = IPromiseLikeKind>` (interface)

```text
<T, Args extends unknown[], F = never>(fn: (...args: Args) => PromiseLike<T> | T | TPromiseOf<K, T, F>, ...args: Args): TPromiseOf<K, T, F | Unlisted>
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
exclude?: Array<RegExp | string> | undefined
excludeMain?: boolean | undefined
handleCancel?: ((handle: any, args: any[], getSignal: TGetSignal, reason?: any) => void) | undefined
include?: Array<RegExp | string> | undefined
lazy?: boolean | undefined
mode?: "clone" | "merge" | "overwrite" | undefined
multiArgs?: Array<string> | boolean | undefined
signal?: Array<IAbortSignalLike> | IAbortSignalLike | undefined
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
multiArgs?: Array<string> | boolean | undefined
signal?: Array<IAbortSignalLike> | IAbortSignalLike | undefined
transformArgs?: ((args: any[], getSignal: TGetSignal) => any[]) | undefined
```

## `IRetryOptions<K extends IPromiseKind = IPromiseLikeKind>` (type)

```text
K["options"]
TTimersOverride & { AbortController?: TAbortControllerCtor; TimeoutError?: typeof TimeoutError; }
delay?: ((ctx: IRetryContext & { computedDelay: number; }) => number | undefined) | undefined
factor?: number | undefined
initialDelay?: number | undefined
jitter?: boolean | number | undefined
lazy?: boolean | undefined
maxDelay?: number | undefined
maxTimeout?: number | undefined // @deprecated
minTimeout?: number | undefined // @deprecated
onRetry?: ((reason: any, attempt: number, delay: number) => void) | undefined
retries?: number | undefined
shouldRetry?: ((reason: any, ctx: IRetryContext) => PromiseLike<boolean> | boolean) | undefined
```

## `ISuppressErrorFn<M extends readonly TErrorMatcher[] = readonly TErrorMatcher[]>` (interface)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, Exclude<TFailure, SubtractedError<M[number]>>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): void
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

## `IToolboxOptions` (interface)

```text
extends ICancelablePromiseOptions
lazy?: boolean | undefined
```

## `IWaitForOptions` (type)

```text
TTimersOverride & { AbortController?: TAbortControllerCtor; TimeoutError?: typeof TimeoutError; }
interval?: number | undefined
lazy?: boolean | undefined
timeout?: number | undefined
```

## `LazyPromise<T = any, F = unknown>` (class)

```text
extends LazyBase<T>
new <T = any, F = unknown>(executor: TLazyExecutor<T>, options?: ILazyPromiseOptions | undefined): LazyPromise<T, F>
static _new: <V>(executor: TLazyExecutor<V>, options?: object) => LazyBase<V>
static _optionsChanged: (instance: LazyBase<any>, options?: object) => boolean
static _subscribeInputs: (values: Iterable<unknown>, skipAfterSettled?: boolean) => unknown[]
static all: <V>(values: Iterable<PromiseLike<V> | V>, options?: ILazyPromiseOptions) => LazyPromise<V[]>
static allSettled: <V>(values: Iterable<PromiseLike<V> | V>, options?: ILazyPromiseOptions) => LazyPromise<ISettledResult<Awaited<V>>[]>
static any: <V>(values: Iterable<PromiseLike<V> | V>, options?: ILazyPromiseOptions) => LazyPromise<V>
static race: <V>(values: Iterable<PromiseLike<V> | V>, options?: ILazyPromiseOptions) => LazyPromise<V>
static reject: <V = never>(reason?: any, options?: ILazyPromiseOptions) => LazyPromise<V>
static resolve: <V>(value?: PromiseLike<V> | V, options?: ILazyPromiseOptions) => LazyPromise<V>
static try: <V, TArgs extends any[]>(fn: (...args: TArgs) => V, ...args: TArgs) => LazyPromise<Awaited<V>, FailureOf<V>>
static withResolvers: <V>(options?: ILazyPromiseOptions) => ICancelableLazyWithResolvers<V>
readonly [FAILURE]?: F | undefined
readonly [LAZY_PROMISE_BRAND]: true
_beforeSubscribe: () => PromiseLike<T> | undefined
_cancelError?: CancelError | undefined
_canceledBeforeStart: boolean
_consumers: number
_executor: TLazyExecutor<T>
_handleCancel: (onCancel: TLazyOnCancel) => void
_inner?: TInnerPromise<T> | undefined
_innerOptions: () => object | undefined
_isStartable: () => boolean
_options?: ILazyPromiseOptions | undefined
_pendingCancel?: undefined | { reason: any; }
_reset: () => void
_resettable: boolean
_resolveImpl: () => TPromiseCtor
_resolveImplStatics: () => ILazyImplStatics
_run?: object | undefined
_runTeardowns: (reason?: any) => void
_start: () => PromiseLike<T>
_state: TLazyState
_teardowns: Array<TLazyOnCancel>
_trackConsumer: (derived: PromiseLike<unknown>) => void
_unwatchSignals?: (() => void) | undefined
_watchSignals: () => void
cancel: (reason?: any) => PromiseLike<ISettledResult<unknown>[]> | void
catch: <TResult = never>(onRejected?: ((reason: TReason<F>) => PromiseLike<TResult> | TResult) | null) => PromiseLike<T | TResult>
execute: () => void
finally: (onFinally?: (() => PromiseLike<unknown> | void) | null) => PromiseLike<T>
started: boolean
then: <TResult1 = T, TResult2 = never>(onFulfilled?: ((value: T) => PromiseLike<TResult1> | TResult1) | null, onRejected?: ((reason: TReason<F>) => PromiseLike<TResult2> | TResult2) | null) => PromiseLike<TResult1 | TResult2>
```

## `SupersededError` (type)

```text
_cancErrorBrand: "@cancjs/toolbox:SupersededError"
message: string
name: string
```

## `TCallbackFn` (type)

```text
(...args: Array<any>): any
```

## `TCancelifyFn<A extends any[], R>` (type)

```text
(ctx: ICancelifyContext, ...args: A): PromiseLike<R> | R
```

## `TDuration` (type)

```text
[min: number, max: number] | number
```

## `TEagerToolboxOptions` (type)

```text
asyncCancel?: boolean | undefined
bubble?: boolean | undefined
forceCancelable?: boolean | undefined
shield?: boolean | undefined
signal?: Array<IAbortSignal> | IAbortSignal | undefined
strict?: boolean | undefined
```

## `TErrorConstructor` (type)

```text
new (...args: Array<any>): any
```

## `TErrorMatcher` (type)

```text
TErrorConstructor | TErrorPredicate | string
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
(resolve: (value?: PromiseLike<T> | T | undefined) => void, reject: (reason?: any) => void, handleCancel: (onCancel: TLazyOnCancel) => void): TLazyOnCancel | void
```

## `TLazyOnCancel` (type)

```text
(reason?: any): void
```

## `TMapper<T, R, K extends IPromiseKind = IPromiseLikeKind, F = never>` (type)

```text
(item: T, index: number): PromiseLike<R> | R | TPromiseOf<K, R, F>
```

## `TTimedInput<T, K extends IPromiseKind = IPromiseLikeKind, F = never>` (type)

```text
(() => PromiseLike<T> | T | TPromiseOf<K, T, F>) | PromiseLike<T> | T | TPromiseOf<K, T, F>
```

## `TToolboxExecutor<T>` (type)

```text
(resolve: (value: PromiseLike<T> | T) => void, reject: (reason?: any) => void, ctx?: IExecutorCtx | undefined): void
```

## `TimeoutError` (type)

```text
_cancErrorBrand: "@cancjs/promise:TimeoutError"
cause?: unknown
message: string
name: string
stack?: string | undefined
```

## `cancelify<A extends any[], R>` (function)

```text
<A extends any[], R>(fn: TCancelifyFn<A, R>, options?: ICancelifyOptions | undefined): (...callArgs: A) => CancelablePromise<R, unknown>
```

## `catchAbort` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }) | TResult, Exclude<TFailure, (CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; })>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }) | TResult, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): [Extract<TError, (CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; })>] extends [never] ? (CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }) : Extract<TError, (CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; })>
```

## `catchTimeout` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | TResult, Exclude<TFailure, (CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; })>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | TResult, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): [Extract<TError, (CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; })>] extends [never] ? (CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) : Extract<TError, (CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; })>
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
<T = any>(value: (() => PromiseLike<T> | T) | PromiseLike<T> | T, options?: ILazyPromiseOptions | undefined): LazyPromise<T, unknown>
```

## `createSuppressError<M extends readonly TErrorMatcher[]>` (function)

```text
<M extends readonly TErrorMatcher[]>(...matchers: M): ISuppressErrorFn<M>
```

## `debounce` (const)

```text
<Args extends unknown[], R, F = never>(fn: (...args: Args) => CancelablePromise<R, F> | PromiseLike<R> | R, ms: number, options?: IDebounceOptions | undefined): IDebounced<Args, R, ICancelableKind, F | Unlisted>
```

## `defer` (const)

```text
<T = void>(options?: TEagerToolboxOptions | undefined): ICancelableDeferred<T>
```

## `delay` (const)

```text
<T = void>(ms: TDuration, options: (ILazyOn & TCallDeps) & IToolboxOptions): LazyPromise<T, never>
<T = void>(ms: TDuration, options?: (IToolboxOptions & TCallDeps) | undefined): CancelablePromise<T, never>
<T, F = never>(input: TTimedInput<T, ICancelableKind, F>, ms: TDuration, options: (ILazyOn & TCallDeps) & IToolboxOptions): LazyPromise<T, F>
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
<T = any>(executor: TLazyExecutor<T>, options?: ILazyPromiseOptions | undefined): LazyPromise<T, unknown>
```

## `limit` (const)

```text
(concurrency: number): ILimited<ICancelableKind>
```

## `map` (const)

```text
<T, R, F = never>(input: Iterable<T>, mapper: TMapper<T, R, ICancelableKind, F>, options?: IMapOptions | undefined): CancelablePromise<Array<R>, F | IAggregateError | Unlisted>
```

## `minDelay` (const)

```text
<T, F = never>(input: TTimedInput<T, ICancelableKind, F>, ms: TDuration, options?: TEagerToolboxOptions | undefined): CancelablePromise<T, F>
```

## `promisify` (const)

```text
(fn: TCallbackFn, options: ILazyOn & IPromisifyOptions): (...args: Array<any>) => LazyPromise<any, never>
(fn: TCallbackFn, options?: IPromisifyOptions | undefined): (...args: Array<any>) => CancelablePromise<any, never>
```

## `promisifyAll` (const)

```text
<T extends object>(source: T, options?: IPromisifyAllOptions | undefined): any
```

## `retry` (const)

```text
<T, F = never>(input: (attempt: number) => CancelablePromise<T, F> | PromiseLike<T> | T, options: ILazyOn & IRetryOptions<ICancelableKind>): LazyPromise<T, F>
<T, F = never>(input: (attempt: number) => CancelablePromise<T, F> | PromiseLike<T> | T, options?: IRetryOptions<ICancelableKind> | undefined): CancelablePromise<T, F>
```

## `suppressAbort` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, Exclude<TFailure, (CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; })>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): void
```

## `suppressTimeout` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, Exclude<TFailure, (CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; })>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): void
```

## `throttle` (const)

```text
<Args extends unknown[], R, F = never>(fn: (...args: Args) => CancelablePromise<R, F> | PromiseLike<R> | R, ms: number, options?: IThrottleOptions | undefined): IThrottled<Args, R, ICancelableKind, F | Unlisted>
```

## `timeout` (const)

```text
(ms: TDuration, options: (ILazyOn & TCallDeps) & IToolboxOptions): LazyPromise<never, (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | Unlisted>
(ms: TDuration, options?: (IToolboxOptions & TCallDeps) | undefined): CancelablePromise<never, (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | Unlisted>
<P extends PromiseLike<unknown>>(input: (() => P) | P, ms: TDuration | undefined, options: (ILazyOn & TCallDeps) & IToolboxOptions): LazyPromise<TValueOf<P>, (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | FailureOf<P> | Unlisted>
<P extends PromiseLike<unknown>>(input: (() => P) | P, ms?: TDuration | undefined, options?: (IToolboxOptions & TCallDeps) | undefined): CancelablePromise<TValueOf<P>, (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | FailureOf<P> | Unlisted>
<T, F = never>(input: TTimedInput<T>, ms?: TDuration | undefined, options?: (IToolboxOptions & TCallDeps) | undefined): CancelablePromise<T, (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | F | Unlisted>
```

## `toAbortSignal` (function)

```text
(promise: PromiseLike<unknown>): AbortSignal
```

## `waitFor` (const)

```text
(condition: () => unknown, options: ILazyOn & IWaitForOptions): LazyPromise<void, (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | Unlisted>
(condition: () => unknown, options?: IWaitForOptions | undefined): CancelablePromise<void, (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | Unlisted>
```

## `withSignal<T>` (function)

```text
<T>(signal: AbortSignal | undefined, promiseOrFn: ((signal?: AbortSignal | undefined) => PromiseLike<T> | T) | PromiseLike<T> | T): Promise<T>
```
