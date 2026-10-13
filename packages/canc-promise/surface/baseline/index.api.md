# Public surface: @cancjs/promise .

Generated. Do not edit by hand.

- Declarations: `packages/canc-promise/dist/types/index.d.ts`
- Exports: 74

## `AbortError` (type)

```text
_cancErrorBrand: "@cancjs/promise:AbortError"
message: string
name: string
```

## `AggregateError` (type)

```text
errors: Array<any>
```

## `CANCEL_ERROR_BRAND` (const)

```text
typeof CANCEL_ERROR_BRAND
```

## `CANCEL_PROMISE_BRAND` (const)

```text
typeof CANCEL_PROMISE_BRAND
```

## `CANCEL_SIGNAL_BRAND` (const)

```text
typeof CANCEL_SIGNAL_BRAND
```

## `CancelError` (class)

```text
extends Error
new (reason?: string | undefined, options?: ICancelErrorOptions | undefined): CancelError
readonly [CANCEL_ERROR_BRAND]: true
readonly [toStringTag]: string
aborted: boolean
bubbled: boolean
cause?: any
disposed: boolean
isBubbled: boolean // @deprecated
name: string
timedOut: boolean
```

## `CancelSignal` (type)

```text
AbortSignal
readonly [CANCEL_SIGNAL_BRAND]: true
```

## `CancelablePromise<TResult, TFailure = never>` (class)

```text
implements ICancelable<TResult>, Promise<TResult>
new <TResult, TFailure = never>(executor: TCancelablePromiseExecutor<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult, TFailure>
static readonly [species]: PromiseConstructor
static _activeCollector: Array<any> | undefined
static _adopt: <T>(value: PromiseLike<T> | T, normalizedOptions: ICancelablePromiseOptions) => CancelablePromise<T>
static _cancelLosers: (inputs: CancelablePromise<any, any>[], winner: CancelablePromise<any, any>) => void
static _checkOptionsChanged: (instance: ICancelablePromiseOptions, options?: ICancelablePromiseOptions) => boolean
static _getOptions: (options?: ICancelablePromiseOptions) => ICancelablePromiseOptions & Required<ICancelablePromiseFlagOptions>
static _pendingInternalCall: boolean
static all: { <T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(values: readonly [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>, Awaited<T8>, Awaited<T9>, Awaited<T10>], FailureOf<T10> | FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7> | FailureOf<T8> | FailureOf<T9>>; <T1, T2, T3, T4, T5, T6, T7, T8, T9>(values: readonly [T1, T2, T3, T4, T5, T6, T7, T8, T9], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>, Awaited<T8>, Awaited<T9>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7> | FailureOf<T8> | FailureOf<T9>>; <T1, T2, T3, T4, T5, T6, T7, T8>(values: readonly [T1, T2, T3, T4, T5, T6, T7, T8], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>, Awaited<T8>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7> | FailureOf<T8>>; <T1, T2, T3, T4, T5, T6, T7>(values: readonly [T1, T2, T3, T4, T5, T6, T7], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7>>; <T1, T2, T3, T4, T5, T6>(values: readonly [T1, T2, T3, T4, T5, T6], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6>>; <T1, T2, T3, T4, T5>(values: readonly [T1, T2, T3, T4, T5], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5>>; <T1, T2, T3, T4>(values: readonly [T1, T2, T3, T4], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4>>; <T1, T2, T3>(values: readonly [T1, T2, T3], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3>>; <T1, T2>(values: readonly [T1, T2], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>], FailureOf<T1> | FailureOf<T2>>; <TResult>(values: readonly TResult[], options?: ICancelablePromiseOptions): CancelablePromise<Awaited<TResult>[], FailureOf<TResult>>; <TAll>(values: Iterable<PromiseLike<TAll> | TAll>, options?: ICancelablePromiseOptions): CancelablePromise<TAll[], FailureOf<TAll>>; }
static allSettled: { <T extends readonly [unknown] | readonly unknown[]>(values: T, options?: ICancelablePromiseOptions): CancelablePromise<{ -readonly [P in keyof T]: PromiseSettledResult<Awaited<T[P]>>; }, never>; <T>(values: Iterable<T>, options?: ICancelablePromiseOptions): CancelablePromise<PromiseSettledResult<Awaited<T>>[], never>; }
static any: { <T extends [] | readonly unknown[]>(values: T, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T[number]>, AggregateError>; <T>(values: Iterable<PromiseLike<T> | T>, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>, AggregateError>; }
static defaultOptions: Required<ICancelablePromiseFlagOptions>
static race: { <T>(values: readonly T[], options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>, FailureOf<T>>; <T>(values: Iterable<T>, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>, FailureOf<T>>; <T>(values: Iterable<PromiseLike<T> | T>, options?: ICancelablePromiseOptions): CancelablePromise<T, FailureOf<T>>; }
static reject: <TResult = never, TFailure = never>(reason?: TFailure, options?: ICancelablePromiseOptions) => CancelablePromise<TResult, unknown extends TFailure ? never : TFailure>
static resolve: { <V>(value: V, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<V>, FailureOf<V>>; (): CancelablePromise<void, never>; }
static try: <T, TArgs extends any[]>(fn: (...args: TArgs) => T, ...args: TArgs) => CancelablePromise<Awaited<T>, FailureOf<T>>
static withResolvers: <TResult, TFailure = never>(options?: ICancelablePromiseOptions) => ICancelablePromiseWithResolvers<TResult, TFailure>
readonly [CANCEL_PROMISE_BRAND]: true
readonly [FAILURE]?: TFailure | undefined
readonly [toStringTag]: string
_abortListeners?: Map<IAbortSignal, any> | undefined
_abortSignals?: Array<IAbortSignal> | undefined
_addChainRef: (bubbleOnComplete?: boolean) => (() => void) | undefined
_boundCancel?: ((reason?: any, _disposing?: boolean) => CancelablePromise<PromiseSettledResult<unknown>[]> | void) | undefined
_cancel: (reason?: any, disposing?: boolean, collector?: any[]) => void
_cancelHandlers?: Array<TOnCancel> | undefined
_canceledReason: any
_chain: (childPromise: CancelablePromise<any, any>, bubbleOnComplete?: boolean) => void
_chainInput: (resultPromise: CancelablePromise<any, any>, bubbleOnComplete?: boolean) => void
_chainsCount: number
_collector?: Array<any> | undefined
_completedChainsCount: number
_dispose: () => CancelablePromise<PromiseSettledResult<unknown>[]> | void
_flags: number
_getBoundCancel: () => CancelablePromise<TResult, TFailure>["cancel"]
_internalState: TCancelablePromiseStates
_isCanceledReasonSet: boolean
_pendingSyncCancel: boolean
_pendingSyncCancelReason: any
_reject: (reason?: any) => void
_resolve: (value?: any) => void
_runCancellation: (reason?: any, collector?: any[]) => void
_runSettlementEffects: () => void
_setFlag: any
_subscribe: (onFulfilled?: ((value: TResult) => any) | null, onRejected?: ((reason: any) => any) | null) => void
_then: <TResult1 = TResult, TResult2 = never>(onFulfilled?: ((value: TResult) => TResult1) | null, onRejected?: ((reason: TReason<TFailure>) => TResult2) | null) => CancelablePromise<Awaited<TResult1 | TResult2>, ([TResult2] extends [never] ? TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>
asyncCancel: boolean
bubble: boolean
cancel: (reason?: any, _disposing?: boolean) => CancelablePromise<PromiseSettledResult<unknown>[]> | void
cancelable: boolean
canceled: boolean
catch: { <R extends PromiseLike<unknown>>(onRejected: (reason: TReason<TFailure>) => R): CancelablePromise<Awaited<R | TResult>, FailureOf<R>>; <R = never>(onRejected?: ((reason: TReason<TFailure>) => R) | null): CancelablePromise<Awaited<R | TResult>, FailureOf<R>>; }
finally: (onFinally?: (() => PromiseLike<unknown> | void) | null) => CancelablePromise<TResult, TFailure>
forceCancelable: boolean
handleCancel: (onCancel: TOnCancel, options?: IHandleCancelOptions) => CancelablePromise<TResult, TFailure>
isCancelable: boolean // @deprecated
isCanceled: boolean // @deprecated
options: Required<ICancelablePromiseFlagOptions>
shield: boolean
strict: boolean
then: { <TResult1 extends PromiseLike<unknown>, TResult2 extends PromiseLike<unknown>>(onFulfilled: (value: TResult) => TResult1, onRejected: (reason: TReason<TFailure>) => TResult2): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<unknown>, TResult2 = never>(onFulfilled: (value: TResult) => TResult1, onRejected?: ((reason: TReason<TFailure>) => TResult2) | null): CancelablePromise<Awaited<TResult1 | TResult2>, ([TResult2] extends [never] ? TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = TResult, TResult2 extends PromiseLike<unknown> = never>(onFulfilled: ((value: TResult) => TResult1) | null | undefined, onRejected: (reason: TReason<TFailure>) => TResult2): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = TResult, TResult2 = never>(onFulfilled?: ((value: TResult) => TResult1) | null, onRejected?: ((reason: TReason<TFailure>) => TResult2) | null): CancelablePromise<Awaited<TResult1 | TResult2>, ([TResult2] extends [never] ? TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; }
```

## `FAILURE` (const)

```text
typeof FAILURE
```

## `Failing<TFailure>` (interface)

```text
readonly [FAILURE]?: TFailure | undefined
```

## `FailureOf<T>` (type)

```text
T extends { readonly [FAILURE]?: infer F; } ? [F] extends [undefined] ? never : F : never
```

## `ICancelErrorOptions` (interface)

```text
cause?: any
```

## `ICancelable<TResult = any>` (interface)

```text
extends PromiseLike<TResult>
cancel: (reason?: any) => any
```

## `ICancelableHelperOptions` (interface)

```text
extends ICancelablePromiseOptions
CancelablePromise?: typeof CancelablePromise | undefined
asyncCancel?: boolean | undefined
bubble?: boolean | undefined
forceCancelable?: boolean | undefined
shield?: boolean | undefined
signal?: Array<IAbortSignal> | IAbortSignal | undefined
strict?: boolean | undefined
```

## `ICancelablePromiseFlagOptions` (interface)

```text
asyncCancel?: boolean | undefined
bubble?: boolean | undefined
forceCancelable?: boolean | undefined
shield?: boolean | undefined
strict?: boolean | undefined
```

## `ICancelablePromiseOptions` (interface)

```text
extends ICancelablePromiseFlagOptions
asyncCancel?: boolean | undefined
bubble?: boolean | undefined
forceCancelable?: boolean | undefined
shield?: boolean | undefined
signal?: Array<IAbortSignal> | IAbortSignal | undefined
strict?: boolean | undefined
```

## `ICancelablePromiseWithResolvers<TResult, TFailure = never>` (interface)

```text
cancel: (reason?: any) => CancelablePromise<PromiseSettledResult<unknown>[]> | void
promise: CancelablePromise<TResult, TFailure>
reject: (reason?: any) => void
resolve: (value: PromiseLike<TResult> | TResult) => void
```

## `ICatchErrorFn<M extends readonly TErrorMatcher[] = readonly TErrorMatcher[]>` (interface)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<MatchedError<M[number]> | TResult, Exclude<TFailure, SubtractedError<M[number]>>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<MatchedError<M[number]> | TResult, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): [Extract<TError, MatchedError<M[number]>>] extends [never] ? MatchedError<M[number]> : Extract<TError, MatchedError<M[number]>>
```

## `ICatchSuppressOptions` (interface)

```text
extends ICancelablePromiseOptions
abort?: boolean | undefined
asyncCancel?: boolean | undefined
bubble?: boolean | undefined
forceCancelable?: boolean | undefined
shield?: boolean | undefined
signal?: Array<IAbortSignal> | IAbortSignal | undefined
strict?: boolean | undefined
timeout?: boolean | undefined
```

## `IExecutorContext<TResult = any, TFailure = never>` (interface)

```text
getSignal: (this: void) => IAbortSignal
handleCancel: (this: void, onCancel: TOnCancel) => CancelablePromise<TResult, TFailure>
```

## `IHandleCancelOptions` (interface)

```text
immediate?: boolean | undefined
```

## `IPromiseImplOptions` (interface)

```text
impl?: PromiseConstructor | undefined
```

## `ISuppressErrorFn<M extends readonly TErrorMatcher[] = readonly TErrorMatcher[]>` (interface)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, Exclude<TFailure, SubtractedError<M[number]>>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): void
```

## `MatchedError<M>` (type)

```text
M extends TErrorConstructor ? InstanceType<M> : M extends (error: any) => error is infer G ? G : M extends string ? Error & { name: M; } : Error
```

## `MatchedOf<M extends readonly TErrorMatcher[]>` (type)

```text
M[number] extends TErrorConstructor ? InstanceType<M[number]> : M[number] extends (error: any) => error is infer G ? G : M[number] extends string ? Error & { name: M[number]; } : Error
```

## `PromiseImpl` (type)

```text
new <T>(executor: (resolve: (value: PromiseLike<T> | T) => void, reject: (reason?: any) => void) => void): Promise<T>
```

## `ResultOf<T>` (type)

```text
T extends null | undefined ? T : T extends object & { then(onfulfilled: infer F, ...args: infer _): any; } ? F extends (value: infer V, ...args: infer _) => any ? Awaited<V> : never : T
```

## `SubtractedError<M>` (type)

```text
M extends TErrorConstructor ? InstanceType<M> : M extends (error: any) => error is infer G ? G : M extends string ? Error & { name: M; } : never
```

## `SubtractedOf<M extends readonly TErrorMatcher[]>` (type)

```text
M[number] extends TErrorConstructor ? InstanceType<M[number]> : M[number] extends (error: any) => error is infer G ? G : M[number] extends string ? Error & { name: M[number]; } : never
```

## `TCancelFn` (type)

```text
(reason?: TCancelReason | undefined): void
```

## `TCancelReason` (type)

```text
CancelError | object | string
```

## `TCancelablePromiseExecutor<TResult, TFailure = never>` (type)

```text
(resolve: (value?: PromiseLike<TResult> | TResult | undefined) => void, reject: (reason?: CancelError | TReason<TFailure> | undefined) => void, ctx: IExecutorContext<TResult, TFailure>): void
```

## `TCancelablePromiseStates` (type)

```text
"CANCELED" | "FORCE_PENDING" | "FULFILLED" | "PENDING" | "REJECTED"
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

## `TOnCancel` (type)

```text
(reason?: TCancelReason | undefined): PromiseLike<unknown> | void
```

## `TPromiseExecutor<TResult>` (type)

```text
(resolve: (value?: PromiseLike<TResult> | TResult | undefined) => void, reject: (reason?: any) => void): void
```

## `TReason<TFailure>` (type)

```text
[TFailure] extends [never] ? unknown : TFailure
```

## `TimeoutError` (type)

```text
_cancErrorBrand: "@cancjs/promise:TimeoutError"
message: string
name: string
```

## `WithFailure<TPromise extends CancelablePromise<any, any>, TFailure>` (type)

```text
readonly [CANCEL_PROMISE_BRAND]: true
readonly [FAILURE]?: FailureOf<TPromise> | TFailure | undefined
readonly [toStringTag]: string
_abortListeners?: Map<IAbortSignal, any> | undefined
_abortSignals?: Array<IAbortSignal> | undefined
_addChainRef: (bubbleOnComplete?: boolean) => (() => void) | undefined
_boundCancel?: ((reason?: any, _disposing?: boolean) => CancelablePromise<PromiseSettledResult<unknown>[]> | void) | undefined
_cancel: (reason?: any, disposing?: boolean, collector?: any[]) => void
_cancelHandlers?: Array<TOnCancel> | undefined
_canceledReason: any
_chain: (childPromise: CancelablePromise<any, any>, bubbleOnComplete?: boolean) => void
_chainInput: (resultPromise: CancelablePromise<any, any>, bubbleOnComplete?: boolean) => void
_chainsCount: number
_collector?: Array<any> | undefined
_completedChainsCount: number
_dispose: () => CancelablePromise<PromiseSettledResult<unknown>[]> | void
_flags: number
_getBoundCancel: () => (reason?: any, _disposing?: boolean) => CancelablePromise<PromiseSettledResult<unknown>[]> | void
_internalState: TCancelablePromiseStates
_isCanceledReasonSet: boolean
_pendingSyncCancel: boolean
_pendingSyncCancelReason: any
_reject: (reason?: any) => void
_resolve: (value?: any) => void
_runCancellation: (reason?: any, collector?: any[]) => void
_runSettlementEffects: () => void
_setFlag: any
_subscribe: (onFulfilled?: ((value: Awaited<TPromise>) => any) | null | undefined, onRejected?: ((reason: any) => any) | null) => void
_then: <TResult1 = Awaited<TPromise>, TResult2 = never>(onFulfilled?: ((value: Awaited<TPromise>) => TResult1) | null | undefined, onRejected?: ((reason: TReason<FailureOf<TPromise> | TFailure>) => TResult2) | null | undefined) => CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? FailureOf<TPromise> | TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>
asyncCancel: boolean
bubble: boolean
cancel: (reason?: any, _disposing?: boolean) => CancelablePromise<PromiseSettledResult<unknown>[]> | void
cancelable: boolean
canceled: boolean
catch: { <R extends PromiseLike<unknown>>(onRejected: (reason: TReason<FailureOf<TPromise> | TFailure>) => R): CancelablePromise<Awaited<Awaited<TPromise>> | Awaited<R>, FailureOf<R>>; <R = never>(onRejected?: ((reason: TReason<FailureOf<TPromise> | TFailure>) => R) | null | undefined): CancelablePromise<Awaited<Awaited<TPromise>> | Awaited<R>, FailureOf<R>>; }
finally: (onFinally?: (() => PromiseLike<unknown> | void) | null) => CancelablePromise<Awaited<TPromise>, FailureOf<TPromise> | TFailure>
forceCancelable: boolean
handleCancel: (onCancel: TOnCancel, options?: IHandleCancelOptions) => CancelablePromise<Awaited<TPromise>, FailureOf<TPromise> | TFailure>
isCancelable: boolean // @deprecated
isCanceled: boolean // @deprecated
options: Required<ICancelablePromiseFlagOptions>
shield: boolean
strict: boolean
then: { <TResult1 extends PromiseLike<unknown>, TResult2 extends PromiseLike<unknown>>(onFulfilled: (value: Awaited<TPromise>) => TResult1, onRejected: (reason: TReason<FailureOf<TPromise> | TFailure>) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<unknown>, TResult2 = never>(onFulfilled: (value: Awaited<TPromise>) => TResult1, onRejected?: ((reason: TReason<FailureOf<TPromise> | TFailure>) => TResult2) | null | undefined): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? FailureOf<TPromise> | TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = Awaited<TPromise>, TResult2 extends PromiseLike<unknown> = never>(onFulfilled: ((value: Awaited<TPromise>) => TResult1) | null | undefined, onRejected: (reason: TReason<FailureOf<TPromise> | TFailure>) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = Awaited<TPromise>, TResult2 = never>(onFulfilled?: ((value: Awaited<TPromise>) => TResult1) | null | undefined, onRejected?: ((reason: TReason<FailureOf<TPromise> | TFailure>) => TResult2) | null | undefined): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? FailureOf<TPromise> | TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; }
```

## `catchAbort` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }) | TResult, Exclude<TFailure, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }) | TResult, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): [Extract<TError, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }>] extends [never] ? ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; } : Extract<TError, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }>
```

## `catchCancel<TResult, TFailure, O extends ICatchSuppressOptions = {}>` (function)

```text
<TResult, TFailure, O extends ICatchSuppressOptions = {}>(promise: CancelablePromise<TResult, TFailure>, options?: O | undefined): CancelablePromise<CancelError | TFlaggedErrors<O> | TResult, Exclude<TFailure, TFlaggedErrors<O>>>
<TResult, O extends ICatchSuppressOptions = {}>(promise: PromiseLike<TResult>, options?: O | undefined): CancelablePromise<CancelError | TFlaggedErrors<O> | TResult, never>
<TError, O extends ICatchSuppressOptions = {}>(error: TError, options?: O | undefined): CancelError | TError
```

## `catchErrors<TResult, TFailure, M extends readonly TErrorMatcher[]>` (function)

```text
<TResult, TFailure, M extends readonly TErrorMatcher[]>(promise: CancelablePromise<TResult, TFailure>, ...matchers: M): CancelablePromise<MatchedOf<M> | TResult, Exclude<TFailure, SubtractedOf<M>>>
<TResult, M extends readonly TErrorMatcher[]>(promise: PromiseLike<TResult>, ...matchers: M): CancelablePromise<MatchedOf<M> | TResult, never>
<M extends readonly TErrorMatcher[]>(error: unknown, ...matchers: M): asserts error is MatchedOf<M>
```

## `catchTimeout` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | TResult, Exclude<TFailure, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | TResult, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): [Extract<TError, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>] extends [never] ? ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; } : Extract<TError, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>
```

## `createCancelSignal` (function)

```text
(reason?: any): { cancel: (r?: any) => void; signal: CancelSignal; }
```

## `createCatchError<M extends readonly TErrorMatcher[]>` (function)

```text
<M extends readonly TErrorMatcher[]>(...matchers: M): ICatchErrorFn<M>
```

## `createIsError<M extends readonly TErrorMatcher[]>` (function)

```text
<M extends readonly TErrorMatcher[]>(...matchers: M): (error: unknown) => error is MatchedOf<M>
```

## `createSuppressError<M extends readonly TErrorMatcher[]>` (function)

```text
<M extends readonly TErrorMatcher[]>(...matchers: M): ISuppressErrorFn<M>
```

## `default<TResult, TFailure = never>` (class)

```text
implements ICancelable<TResult>, Promise<TResult>
new <TResult, TFailure = never>(executor: TCancelablePromiseExecutor<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult, TFailure>
static readonly [species]: PromiseConstructor
static _activeCollector: Array<any> | undefined
static _adopt: <T>(value: PromiseLike<T> | T, normalizedOptions: ICancelablePromiseOptions) => CancelablePromise<T>
static _cancelLosers: (inputs: CancelablePromise<any, any>[], winner: CancelablePromise<any, any>) => void
static _checkOptionsChanged: (instance: ICancelablePromiseOptions, options?: ICancelablePromiseOptions) => boolean
static _getOptions: (options?: ICancelablePromiseOptions) => ICancelablePromiseOptions & Required<ICancelablePromiseFlagOptions>
static _pendingInternalCall: boolean
static all: { <T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(values: readonly [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>, Awaited<T8>, Awaited<T9>, Awaited<T10>], FailureOf<T10> | FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7> | FailureOf<T8> | FailureOf<T9>>; <T1, T2, T3, T4, T5, T6, T7, T8, T9>(values: readonly [T1, T2, T3, T4, T5, T6, T7, T8, T9], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>, Awaited<T8>, Awaited<T9>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7> | FailureOf<T8> | FailureOf<T9>>; <T1, T2, T3, T4, T5, T6, T7, T8>(values: readonly [T1, T2, T3, T4, T5, T6, T7, T8], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>, Awaited<T8>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7> | FailureOf<T8>>; <T1, T2, T3, T4, T5, T6, T7>(values: readonly [T1, T2, T3, T4, T5, T6, T7], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7>>; <T1, T2, T3, T4, T5, T6>(values: readonly [T1, T2, T3, T4, T5, T6], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6>>; <T1, T2, T3, T4, T5>(values: readonly [T1, T2, T3, T4, T5], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5>>; <T1, T2, T3, T4>(values: readonly [T1, T2, T3, T4], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4>>; <T1, T2, T3>(values: readonly [T1, T2, T3], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3>>; <T1, T2>(values: readonly [T1, T2], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>], FailureOf<T1> | FailureOf<T2>>; <TResult>(values: readonly TResult[], options?: ICancelablePromiseOptions): CancelablePromise<Awaited<TResult>[], FailureOf<TResult>>; <TAll>(values: Iterable<PromiseLike<TAll> | TAll>, options?: ICancelablePromiseOptions): CancelablePromise<TAll[], FailureOf<TAll>>; }
static allSettled: { <T extends readonly [unknown] | readonly unknown[]>(values: T, options?: ICancelablePromiseOptions): CancelablePromise<{ -readonly [P in keyof T]: PromiseSettledResult<Awaited<T[P]>>; }, never>; <T>(values: Iterable<T>, options?: ICancelablePromiseOptions): CancelablePromise<PromiseSettledResult<Awaited<T>>[], never>; }
static any: { <T extends [] | readonly unknown[]>(values: T, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T[number]>, AggregateError>; <T>(values: Iterable<PromiseLike<T> | T>, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>, AggregateError>; }
static defaultOptions: Required<ICancelablePromiseFlagOptions>
static race: { <T>(values: readonly T[], options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>, FailureOf<T>>; <T>(values: Iterable<T>, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>, FailureOf<T>>; <T>(values: Iterable<PromiseLike<T> | T>, options?: ICancelablePromiseOptions): CancelablePromise<T, FailureOf<T>>; }
static reject: <TResult = never, TFailure = never>(reason?: TFailure, options?: ICancelablePromiseOptions) => CancelablePromise<TResult, unknown extends TFailure ? never : TFailure>
static resolve: { <V>(value: V, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<V>, FailureOf<V>>; (): CancelablePromise<void, never>; }
static try: <T, TArgs extends any[]>(fn: (...args: TArgs) => T, ...args: TArgs) => CancelablePromise<Awaited<T>, FailureOf<T>>
static withResolvers: <TResult, TFailure = never>(options?: ICancelablePromiseOptions) => ICancelablePromiseWithResolvers<TResult, TFailure>
readonly [CANCEL_PROMISE_BRAND]: true
readonly [FAILURE]?: TFailure | undefined
readonly [toStringTag]: string
_abortListeners?: Map<IAbortSignal, any> | undefined
_abortSignals?: Array<IAbortSignal> | undefined
_addChainRef: (bubbleOnComplete?: boolean) => (() => void) | undefined
_boundCancel?: ((reason?: any, _disposing?: boolean) => CancelablePromise<PromiseSettledResult<unknown>[]> | void) | undefined
_cancel: (reason?: any, disposing?: boolean, collector?: any[]) => void
_cancelHandlers?: Array<TOnCancel> | undefined
_canceledReason: any
_chain: (childPromise: CancelablePromise<any, any>, bubbleOnComplete?: boolean) => void
_chainInput: (resultPromise: CancelablePromise<any, any>, bubbleOnComplete?: boolean) => void
_chainsCount: number
_collector?: Array<any> | undefined
_completedChainsCount: number
_dispose: () => CancelablePromise<PromiseSettledResult<unknown>[]> | void
_flags: number
_getBoundCancel: () => CancelablePromise<TResult, TFailure>["cancel"]
_internalState: TCancelablePromiseStates
_isCanceledReasonSet: boolean
_pendingSyncCancel: boolean
_pendingSyncCancelReason: any
_reject: (reason?: any) => void
_resolve: (value?: any) => void
_runCancellation: (reason?: any, collector?: any[]) => void
_runSettlementEffects: () => void
_setFlag: any
_subscribe: (onFulfilled?: ((value: TResult) => any) | null, onRejected?: ((reason: any) => any) | null) => void
_then: <TResult1 = TResult, TResult2 = never>(onFulfilled?: ((value: TResult) => TResult1) | null, onRejected?: ((reason: TReason<TFailure>) => TResult2) | null) => CancelablePromise<Awaited<TResult1 | TResult2>, ([TResult2] extends [never] ? TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>
asyncCancel: boolean
bubble: boolean
cancel: (reason?: any, _disposing?: boolean) => CancelablePromise<PromiseSettledResult<unknown>[]> | void
cancelable: boolean
canceled: boolean
catch: { <R extends PromiseLike<unknown>>(onRejected: (reason: TReason<TFailure>) => R): CancelablePromise<Awaited<R | TResult>, FailureOf<R>>; <R = never>(onRejected?: ((reason: TReason<TFailure>) => R) | null): CancelablePromise<Awaited<R | TResult>, FailureOf<R>>; }
finally: (onFinally?: (() => PromiseLike<unknown> | void) | null) => CancelablePromise<TResult, TFailure>
forceCancelable: boolean
handleCancel: (onCancel: TOnCancel, options?: IHandleCancelOptions) => CancelablePromise<TResult, TFailure>
isCancelable: boolean // @deprecated
isCanceled: boolean // @deprecated
options: Required<ICancelablePromiseFlagOptions>
shield: boolean
strict: boolean
then: { <TResult1 extends PromiseLike<unknown>, TResult2 extends PromiseLike<unknown>>(onFulfilled: (value: TResult) => TResult1, onRejected: (reason: TReason<TFailure>) => TResult2): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<unknown>, TResult2 = never>(onFulfilled: (value: TResult) => TResult1, onRejected?: ((reason: TReason<TFailure>) => TResult2) | null): CancelablePromise<Awaited<TResult1 | TResult2>, ([TResult2] extends [never] ? TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = TResult, TResult2 extends PromiseLike<unknown> = never>(onFulfilled: ((value: TResult) => TResult1) | null | undefined, onRejected: (reason: TReason<TFailure>) => TResult2): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = TResult, TResult2 = never>(onFulfilled?: ((value: TResult) => TResult1) | null, onRejected?: ((reason: TReason<TFailure>) => TResult2) | null): CancelablePromise<Awaited<TResult1 | TResult2>, ([TResult2] extends [never] ? TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; }
```

## `getPromiseImpl` (function)

```text
(): PromiseConstructor
```

## `isAbortError` (const)

```text
(error: any): error is ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }
```

## `isAggregateError` (const)

```text
(error: any): error is IAggregateError
```

## `isCancPromise` (const)

```text
(value: any): value is CancelablePromise<any, never>
```

## `isCancelError` (const)

```text
(error: any): error is CancelError
```

## `isCancelSignal` (const)

```text
(value: any): value is CancelSignal
```

## `isErrorOf<M extends readonly TErrorMatcher[]>` (function)

```text
<M extends readonly TErrorMatcher[]>(error: unknown, ...matchers: M): error is MatchedOf<M>
```

## `isTimeoutError` (const)

```text
(error: any): error is ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }
```

## `makeCancelable<T>` (function)

```text
<T>(promise: PromiseLike<T>, options?: ICancelableHelperOptions | undefined): CancelablePromise<T, never>
```

## `resolvePromiseImpl` (function)

```text
(options?: IPromiseImplOptions | undefined, staticImpl?: PromiseConstructor | undefined): PromiseConstructor
```

## `setPromiseImpl` (function)

```text
(impl?: PromiseConstructor | undefined): void
```

## `suppressAbort` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, Exclude<TFailure, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): void
```

## `suppressCancel<TResult, TFailure, O extends ICatchSuppressOptions = {}>` (function)

```text
<TResult, TFailure, O extends ICatchSuppressOptions = {}>(promise: CancelablePromise<TResult, TFailure>, options?: O | undefined): CancelablePromise<TResult | void, Exclude<TFailure, TFlaggedErrors<O>>>
<TResult, O extends ICatchSuppressOptions = {}>(promise: PromiseLike<TResult>, options?: O | undefined): CancelablePromise<TResult | void, never>
<TError, O extends ICatchSuppressOptions = {}>(error: TError, options?: O | undefined): void
```

## `suppressErrors<TResult, TFailure, M extends readonly TErrorMatcher[]>` (function)

```text
<TResult, TFailure, M extends readonly TErrorMatcher[]>(promise: CancelablePromise<TResult, TFailure>, ...matchers: M): CancelablePromise<TResult | void, Exclude<TFailure, SubtractedOf<M>>>
<TResult, M extends readonly TErrorMatcher[]>(promise: PromiseLike<TResult>, ...matchers: M): CancelablePromise<TResult | void, never>
<M extends readonly TErrorMatcher[]>(error: unknown, ...matchers: M): asserts error is MatchedOf<M>
```

## `suppressTimeout` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, Exclude<TFailure, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): void
```

## `withFailure<TFailure>` (function)

```text
<TFailure>(): <TResult>(promise: CancelablePromise<TResult, any>) => CancelablePromise<TResult, TFailure>
```

# Internal (not public)

## `_AbortError` (type)

```text
_cancErrorBrand: "@cancjs/promise:AbortError"
message: string
name: string
```

## `_TimeoutError` (type)

```text
_cancErrorBrand: "@cancjs/promise:TimeoutError"
message: string
name: string
```

## `_createCatchError<M extends readonly TErrorMatcher[]>` (function)

```text
<M extends readonly TErrorMatcher[]>(...matchers: M): ICatchErrorFn<M>
```

## `_createSuppressError<M extends readonly TErrorMatcher[]>` (function)

```text
<M extends readonly TErrorMatcher[]>(...matchers: M): ISuppressErrorFn<M>
```

## `_isAbortError` (const)

```text
(error: any): error is ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }
```

## `_isAbortLike` (const)

```text
(error: any): error is ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }
```

## `_isTimeoutError` (const)

```text
(error: any): error is ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }
```

## `_isTimeoutLike` (const)

```text
(error: any): error is ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }
```
