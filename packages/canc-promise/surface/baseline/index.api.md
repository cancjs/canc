# Public surface: @cancjs/promise .

Generated. Do not edit by hand.

- Declarations: `packages/canc-promise/dist/types/index.d.ts`
- Exports: 78

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

## `CancelablePromise<TResult, TFailure = unknown>` (class)

```text
implements ICancelable<TResult>, Promise<TResult>
new <TResult, TFailure = unknown>(executor: TCancelablePromiseExecutor<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult, TFailure>
static readonly [species]: PromiseConstructor
static _activeCollector: Array<any> | undefined
static _adopt: <T>(value: PromiseLike<T> | T, normalizedOptions: ICancelablePromiseOptions) => CancelablePromise<T>
static _checkOptionsChanged: (instance: ICancelablePromiseOptions, options?: ICancelablePromiseOptions) => boolean
static _getOptions: (options?: ICancelablePromiseOptions) => ICancelablePromiseOptions & Required<ICancelablePromiseFlagOptions>
static _pendingInternalCall: boolean
static all: { <T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(values: readonly [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>, Awaited<T8>, Awaited<T9>, Awaited<T10>], FailureOf<T10> | FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7> | FailureOf<T8> | FailureOf<T9>>; <T1, T2, T3, T4, T5, T6, T7, T8, T9>(values: readonly [T1, T2, T3, T4, T5, T6, T7, T8, T9], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>, Awaited<T8>, Awaited<T9>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7> | FailureOf<T8> | FailureOf<T9>>; <T1, T2, T3, T4, T5, T6, T7, T8>(values: readonly [T1, T2, T3, T4, T5, T6, T7, T8], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>, Awaited<T8>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7> | FailureOf<T8>>; <T1, T2, T3, T4, T5, T6, T7>(values: readonly [T1, T2, T3, T4, T5, T6, T7], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7>>; <T1, T2, T3, T4, T5, T6>(values: readonly [T1, T2, T3, T4, T5, T6], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6>>; <T1, T2, T3, T4, T5>(values: readonly [T1, T2, T3, T4, T5], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5>>; <T1, T2, T3, T4>(values: readonly [T1, T2, T3, T4], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4>>; <T1, T2, T3>(values: readonly [T1, T2, T3], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3>>; <T1, T2>(values: readonly [T1, T2], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>], FailureOf<T1> | FailureOf<T2>>; <TResult>(values: readonly TResult[], options?: ICancelablePromiseOptions): CancelablePromise<Awaited<TResult>[], FailureOf<TResult>>; <TAll>(values: Iterable<PromiseLike<TAll> | TAll>, options?: ICancelablePromiseOptions): CancelablePromise<TAll[], FailureOf<TAll>>; }
static allSettled: { <T extends readonly [unknown] | readonly unknown[]>(values: T, options?: ICancelablePromiseOptions): CancelablePromise<{ -readonly [P in keyof T]: ISettledResult<Awaited<T[P]>>; }, never>; <T>(values: Iterable<T>, options?: ICancelablePromiseOptions): CancelablePromise<ISettledResult<Awaited<T>>[], never>; }
static any: { <T extends [] | readonly unknown[]>(values: T, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T[number]>, AggregateError | Unlisted>; <T>(values: Iterable<PromiseLike<T> | T>, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>, AggregateError | Unlisted>; }
static defaultOptions: Required<ICancelablePromiseFlagOptions>
static race: { <T extends [] | readonly unknown[]>(values: T, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T[number]>, FailureOf<T[number]>>; <T>(values: readonly T[], options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>, FailureOf<T>>; <T>(values: Iterable<T>, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>, FailureOf<T>>; <T>(values: Iterable<PromiseLike<T> | T>, options?: ICancelablePromiseOptions): CancelablePromise<T, FailureOf<T>>; }
static reject: <TResult = never, TFailure = never>(reason?: [TFailure] extends [never] ? any : TNoInfer<TFailure>, options?: ICancelablePromiseOptions) => CancelablePromise<TResult, TFailure>
static resolve: { <V>(value: V, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<V>, FailureOf<V>>; (): CancelablePromise<void, never>; }
static try: <T, TArgs extends any[]>(fn: (...args: TArgs) => T, ...args: TArgs) => CancelablePromise<Awaited<T>, FailureOf<T>>
static withResolvers: <TResult, TFailure = unknown>(options?: ICancelablePromiseOptions) => ICancelablePromiseWithResolvers<TResult, TFailure>
readonly [CANCEL_PROMISE_BRAND]: true
readonly [FAILURE]?: Exclude<TFailure, CancelError> | undefined
readonly [toStringTag]: string
_abortListeners?: Map<IAbortSignal, any> | undefined
_abortSignals?: Array<IAbortSignal> | undefined
_addChainRef: (bubbleOnComplete?: boolean) => (() => void) | undefined
_boundCancel?: ((reason?: any, _disposing?: boolean) => CancelablePromise<ISettledResult<unknown>[], never> | void) | undefined
_cancel: (reason?: any, disposing?: boolean, collector?: any[]) => void
_cancelHandlers?: Array<TOnCancel> | undefined
_canceledReason: any
_chain: (childPromise: CancelablePromise<any, any>, bubbleOnComplete?: boolean) => void
_chainsCount: number
_collector?: Array<any> | undefined
_completedChainsCount: number
_dispose: () => CancelablePromise<ISettledResult<unknown>[], never> | void
_flags: number
_getBoundCancel: () => CancelablePromise<TResult, TFailure>["cancel"]
_internalState: TCancelablePromiseStates
_isCanceledReasonSet: boolean
_pendingSyncCancel: boolean
_pendingSyncCancelReason: any
_reject: (reason?: any) => void
_resolve: (value?: any) => void
_retainRef: (settleTiming?: boolean) => (() => void) | undefined
_runCancellation: (reason?: any, collector?: any[]) => void
_runSettlementEffects: () => void
_setFlag: any
_subscribe: (onFulfilled?: ((value: TResult) => any) | null, onRejected?: ((reason: any) => any) | null) => void
_then: <TResult1 = TResult, TResult2 = never>(onFulfilled?: ((value: TResult) => TResult1) | null, onRejected?: ((reason: TReason<TFailure>) => TResult2) | null) => CancelablePromise<Awaited<TResult1 | TResult2>, ([TResult2] extends [never] ? TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>
asyncCancel: boolean // @deprecated
bubble: boolean // @deprecated
cancel: (reason?: any, _disposing?: boolean) => CancelablePromise<ISettledResult<unknown>[], never> | void
cancelable: boolean
canceled: boolean
catch: { <R extends PromiseLike<never>>(onRejected: (reason: TReason<TFailure>) => R): CancelablePromise<Awaited<R | TResult>, FailureOf<R>>; <R = never>(onRejected: (reason: TReason<TFailure>) => R): CancelablePromise<Awaited<R | TResult>, FailureOf<R>>; <R = never>(onRejected?: ((reason: TReason<TFailure>) => R) | null): CancelablePromise<Awaited<R | TResult>, FailureOf<R> | TFailure>; }
finally: (onFinally?: (() => PromiseLike<unknown> | void) | null) => CancelablePromise<TResult, TFailure>
forceCancelable: boolean // @deprecated
handleCancel: (onCancel: TOnCancel, options?: IHandleCancelOptions) => CancelablePromise<TResult, TFailure>
isCancelable: boolean // @deprecated
isCanceled: boolean // @deprecated
options: Required<ICancelablePromiseFlagOptions>
shield: boolean // @deprecated
strict: boolean // @deprecated
then: { <TResult1 extends PromiseLike<never>, TResult2 extends PromiseLike<never>>(onFulfilled: (value: TResult) => TResult1, onRejected: (reason: TReason<TFailure>) => TResult2): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<never>, TResult2 = never>(onFulfilled: (value: TResult) => TResult1, onRejected: (reason: TReason<TFailure>) => TResult2): CancelablePromise<Awaited<TResult1 | TResult2>, ([TResult2] extends [never] ? TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<never>, TResult2 = never>(onFulfilled: (value: TResult) => TResult1, onRejected?: ((reason: TReason<TFailure>) => TResult2) | null): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2> | TFailure>; <TResult1 = TResult, TResult2 extends PromiseLike<never> = never>(onFulfilled: ((value: TResult) => TResult1) | null | undefined, onRejected: (reason: TReason<TFailure>) => TResult2): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = TResult, TResult2 = never>(onFulfilled: ((value: TResult) => TResult1) | null | undefined, onRejected: (reason: TReason<TFailure>) => TResult2): CancelablePromise<Awaited<TResult1 | TResult2>, ([TResult2] extends [never] ? TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = TResult, TResult2 = never>(onFulfilled?: ((value: TResult) => TResult1) | null, onRejected?: ((reason: TReason<TFailure>) => TResult2) | null): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2> | TFailure>; }
```

## `FAILURE` (const)

```text
typeof FAILURE
```

## `Failing<TFailure>` (interface)

```text
readonly [FAILURE]?: Exclude<TFailure, CancelError> | undefined
```

## `FailureOf<T>` (type)

```text
0 extends 1 & T ? never : T extends { readonly [FAILURE]?: infer F; } ? [F] extends [undefined] ? never : F : T extends PromiseLike<unknown> ? Unlisted : never
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

## `ICancelablePromiseWithResolvers<TResult, TFailure = unknown>` (interface)

```text
cancel: (reason?: any) => CancelablePromise<ISettledResult<unknown>[], never> | void
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

## `IExecutorContext<TResult = any, TFailure = unknown>` (interface)

```text
getSignal: (this: void) => IAbortSignal // @deprecated
handleCancel: (this: void, onCancel: TOnCancel) => CancelablePromise<TResult, TFailure>
readonly signal: IAbortSignal
```

## `IHandleCancelOptions` (interface)

```text
immediate?: boolean | undefined
```

## `IPromiseImplOptions` (interface)

```text
// @deprecated
impl?: PromiseConstructor | undefined
```

## `ISettledFulfilled<T>` (interface)

```text
status: "fulfilled"
value: T
```

## `ISettledRejected` (interface)

```text
reason: any
status: "rejected"
```

## `ISettledResult<T>` (type)

```text
ISettledFulfilled<T> | ISettledRejected
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
// @deprecated
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

## `TCancelablePromiseExecutor<TResult, TFailure = unknown>` (type)

```text
(resolve: (value?: PromiseLike<TResult> | TResult | undefined) => void, reject: (reason?: CancelError | TFailure | TReason<TFailure> | undefined) => void, ctx: IExecutorContext<TResult, TFailure>): void
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
[TFailure] extends [never] ? any : [Extract<TFailure, Unlisted>] extends [never] ? [TFailure] extends [infer F] ? unknown extends F ? any : F : never : any
```

## `TimeoutError` (type)

```text
_cancErrorBrand: "@cancjs/promise:TimeoutError"
message: string
name: string
```

## `Unlisted` (interface)

```text
readonly _cancUnlisted: true
```

## `WithFailure<TPromise extends CancelablePromise<any, any>, TFailure>` (type)

```text
readonly [CANCEL_PROMISE_BRAND]: true
readonly [FAILURE]?: Exclude<FailureOf<TPromise>, CancelError> | Exclude<TFailure, CancelError> | undefined
readonly [toStringTag]: string
_abortListeners?: Map<IAbortSignal, any> | undefined
_abortSignals?: Array<IAbortSignal> | undefined
_addChainRef: (bubbleOnComplete?: boolean) => (() => void) | undefined
_boundCancel?: ((reason?: any, _disposing?: boolean) => CancelablePromise<ISettledResult<unknown>[], never> | void) | undefined
_cancel: (reason?: any, disposing?: boolean, collector?: any[]) => void
_cancelHandlers?: Array<TOnCancel> | undefined
_canceledReason: any
_chain: (childPromise: CancelablePromise<any, any>, bubbleOnComplete?: boolean) => void
_chainsCount: number
_collector?: Array<any> | undefined
_completedChainsCount: number
_dispose: () => CancelablePromise<ISettledResult<unknown>[], never> | void
_flags: number
_getBoundCancel: () => (reason?: any, _disposing?: boolean) => CancelablePromise<ISettledResult<unknown>[], never> | void
_internalState: TCancelablePromiseStates
_isCanceledReasonSet: boolean
_pendingSyncCancel: boolean
_pendingSyncCancelReason: any
_reject: (reason?: any) => void
_resolve: (value?: any) => void
_retainRef: (settleTiming?: boolean) => (() => void) | undefined
_runCancellation: (reason?: any, collector?: any[]) => void
_runSettlementEffects: () => void
_setFlag: any
_subscribe: (onFulfilled?: ((value: Awaited<TPromise>) => any) | null | undefined, onRejected?: ((reason: any) => any) | null) => void
_then: <TResult1 = Awaited<TPromise>, TResult2 = never>(onFulfilled?: ((value: Awaited<TPromise>) => TResult1) | null | undefined, onRejected?: ((reason: TReason<FailureOf<TPromise> | TFailure>) => TResult2) | null | undefined) => CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? FailureOf<TPromise> | TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>
asyncCancel: boolean // @deprecated
bubble: boolean // @deprecated
cancel: (reason?: any, _disposing?: boolean) => CancelablePromise<ISettledResult<unknown>[], never> | void
cancelable: boolean
canceled: boolean
catch: { <R extends PromiseLike<never>>(onRejected: (reason: TReason<FailureOf<TPromise> | TFailure>) => R): CancelablePromise<Awaited<Awaited<TPromise>> | Awaited<R>, FailureOf<R>>; <R = never>(onRejected: (reason: TReason<FailureOf<TPromise> | TFailure>) => R): CancelablePromise<Awaited<Awaited<TPromise>> | Awaited<R>, FailureOf<R>>; <R = never>(onRejected?: ((reason: TReason<FailureOf<TPromise> | TFailure>) => R) | null | undefined): CancelablePromise<Awaited<Awaited<TPromise>> | Awaited<R>, FailureOf<R> | FailureOf<TPromise> | TFailure>; }
finally: (onFinally?: (() => PromiseLike<unknown> | void) | null) => CancelablePromise<Awaited<TPromise>, FailureOf<TPromise> | TFailure>
forceCancelable: boolean // @deprecated
handleCancel: (onCancel: TOnCancel, options?: IHandleCancelOptions) => CancelablePromise<Awaited<TPromise>, FailureOf<TPromise> | TFailure>
isCancelable: boolean // @deprecated
isCanceled: boolean // @deprecated
options: Required<ICancelablePromiseFlagOptions>
shield: boolean // @deprecated
strict: boolean // @deprecated
then: { <TResult1 extends PromiseLike<never>, TResult2 extends PromiseLike<never>>(onFulfilled: (value: Awaited<TPromise>) => TResult1, onRejected: (reason: TReason<FailureOf<TPromise> | TFailure>) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<never>, TResult2 = never>(onFulfilled: (value: Awaited<TPromise>) => TResult1, onRejected: (reason: TReason<FailureOf<TPromise> | TFailure>) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? FailureOf<TPromise> | TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<never>, TResult2 = never>(onFulfilled: (value: Awaited<TPromise>) => TResult1, onRejected?: ((reason: TReason<FailureOf<TPromise> | TFailure>) => TResult2) | null | undefined): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TPromise> | FailureOf<TResult1> | FailureOf<TResult2> | TFailure>; <TResult1 = Awaited<TPromise>, TResult2 extends PromiseLike<never> = never>(onFulfilled: ((value: Awaited<TPromise>) => TResult1) | null | undefined, onRejected: (reason: TReason<FailureOf<TPromise> | TFailure>) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = Awaited<TPromise>, TResult2 = never>(onFulfilled: ((value: Awaited<TPromise>) => TResult1) | null | undefined, onRejected: (reason: TReason<FailureOf<TPromise> | TFailure>) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? FailureOf<TPromise> | TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = Awaited<TPromise>, TResult2 = never>(onFulfilled?: ((value: Awaited<TPromise>) => TResult1) | null | undefined, onRejected?: ((reason: TReason<FailureOf<TPromise> | TFailure>) => TResult2) | null | undefined): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TPromise> | FailureOf<TResult1> | FailureOf<TResult2> | TFailure>; }
```

## `catchAbort` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }) | TResult, Exclude<TFailure, (CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; })>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }) | TResult, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): [Extract<TError, (CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; })>] extends [never] ? (CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; }) : Extract<TError, (CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; })>
```

## `catchCancel<TResult, TFailure, O extends ICatchSuppressOptions = {}>` (function)

```text
<TResult, TFailure, O extends ICatchSuppressOptions = {}>(promise: CancelablePromise<TResult, TFailure>, options?: O | undefined): CancelablePromise<CancelError | TResolutionFlags<O> | TResult, Exclude<TFailure, TSubtractionFlags<O>>>
<TResult, O extends ICatchSuppressOptions = {}>(promise: PromiseLike<TResult>, options?: O | undefined): CancelablePromise<CancelError | TResolutionFlags<O> | TResult, never>
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
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | TResult, Exclude<TFailure, (CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; })>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<(CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | TResult, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): [Extract<TError, (CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; })>] extends [never] ? (CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) : Extract<TError, (CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; })>
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

## `default<TResult, TFailure = unknown>` (class)

```text
implements ICancelable<TResult>, Promise<TResult>
new <TResult, TFailure = unknown>(executor: TCancelablePromiseExecutor<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult, TFailure>
static readonly [species]: PromiseConstructor
static _activeCollector: Array<any> | undefined
static _adopt: <T>(value: PromiseLike<T> | T, normalizedOptions: ICancelablePromiseOptions) => CancelablePromise<T>
static _checkOptionsChanged: (instance: ICancelablePromiseOptions, options?: ICancelablePromiseOptions) => boolean
static _getOptions: (options?: ICancelablePromiseOptions) => ICancelablePromiseOptions & Required<ICancelablePromiseFlagOptions>
static _pendingInternalCall: boolean
static all: { <T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(values: readonly [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>, Awaited<T8>, Awaited<T9>, Awaited<T10>], FailureOf<T10> | FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7> | FailureOf<T8> | FailureOf<T9>>; <T1, T2, T3, T4, T5, T6, T7, T8, T9>(values: readonly [T1, T2, T3, T4, T5, T6, T7, T8, T9], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>, Awaited<T8>, Awaited<T9>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7> | FailureOf<T8> | FailureOf<T9>>; <T1, T2, T3, T4, T5, T6, T7, T8>(values: readonly [T1, T2, T3, T4, T5, T6, T7, T8], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>, Awaited<T8>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7> | FailureOf<T8>>; <T1, T2, T3, T4, T5, T6, T7>(values: readonly [T1, T2, T3, T4, T5, T6, T7], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7>>; <T1, T2, T3, T4, T5, T6>(values: readonly [T1, T2, T3, T4, T5, T6], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6>>; <T1, T2, T3, T4, T5>(values: readonly [T1, T2, T3, T4, T5], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5>>; <T1, T2, T3, T4>(values: readonly [T1, T2, T3, T4], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4>>; <T1, T2, T3>(values: readonly [T1, T2, T3], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3>>; <T1, T2>(values: readonly [T1, T2], options?: ICancelablePromiseOptions): CancelablePromise<[Awaited<T1>, Awaited<T2>], FailureOf<T1> | FailureOf<T2>>; <TResult>(values: readonly TResult[], options?: ICancelablePromiseOptions): CancelablePromise<Awaited<TResult>[], FailureOf<TResult>>; <TAll>(values: Iterable<PromiseLike<TAll> | TAll>, options?: ICancelablePromiseOptions): CancelablePromise<TAll[], FailureOf<TAll>>; }
static allSettled: { <T extends readonly [unknown] | readonly unknown[]>(values: T, options?: ICancelablePromiseOptions): CancelablePromise<{ -readonly [P in keyof T]: ISettledResult<Awaited<T[P]>>; }, never>; <T>(values: Iterable<T>, options?: ICancelablePromiseOptions): CancelablePromise<ISettledResult<Awaited<T>>[], never>; }
static any: { <T extends [] | readonly unknown[]>(values: T, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T[number]>, AggregateError | Unlisted>; <T>(values: Iterable<PromiseLike<T> | T>, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>, AggregateError | Unlisted>; }
static defaultOptions: Required<ICancelablePromiseFlagOptions>
static race: { <T extends [] | readonly unknown[]>(values: T, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T[number]>, FailureOf<T[number]>>; <T>(values: readonly T[], options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>, FailureOf<T>>; <T>(values: Iterable<T>, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>, FailureOf<T>>; <T>(values: Iterable<PromiseLike<T> | T>, options?: ICancelablePromiseOptions): CancelablePromise<T, FailureOf<T>>; }
static reject: <TResult = never, TFailure = never>(reason?: [TFailure] extends [never] ? any : TNoInfer<TFailure>, options?: ICancelablePromiseOptions) => CancelablePromise<TResult, TFailure>
static resolve: { <V>(value: V, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<V>, FailureOf<V>>; (): CancelablePromise<void, never>; }
static try: <T, TArgs extends any[]>(fn: (...args: TArgs) => T, ...args: TArgs) => CancelablePromise<Awaited<T>, FailureOf<T>>
static withResolvers: <TResult, TFailure = unknown>(options?: ICancelablePromiseOptions) => ICancelablePromiseWithResolvers<TResult, TFailure>
readonly [CANCEL_PROMISE_BRAND]: true
readonly [FAILURE]?: Exclude<TFailure, CancelError> | undefined
readonly [toStringTag]: string
_abortListeners?: Map<IAbortSignal, any> | undefined
_abortSignals?: Array<IAbortSignal> | undefined
_addChainRef: (bubbleOnComplete?: boolean) => (() => void) | undefined
_boundCancel?: ((reason?: any, _disposing?: boolean) => CancelablePromise<ISettledResult<unknown>[], never> | void) | undefined
_cancel: (reason?: any, disposing?: boolean, collector?: any[]) => void
_cancelHandlers?: Array<TOnCancel> | undefined
_canceledReason: any
_chain: (childPromise: CancelablePromise<any, any>, bubbleOnComplete?: boolean) => void
_chainsCount: number
_collector?: Array<any> | undefined
_completedChainsCount: number
_dispose: () => CancelablePromise<ISettledResult<unknown>[], never> | void
_flags: number
_getBoundCancel: () => CancelablePromise<TResult, TFailure>["cancel"]
_internalState: TCancelablePromiseStates
_isCanceledReasonSet: boolean
_pendingSyncCancel: boolean
_pendingSyncCancelReason: any
_reject: (reason?: any) => void
_resolve: (value?: any) => void
_retainRef: (settleTiming?: boolean) => (() => void) | undefined
_runCancellation: (reason?: any, collector?: any[]) => void
_runSettlementEffects: () => void
_setFlag: any
_subscribe: (onFulfilled?: ((value: TResult) => any) | null, onRejected?: ((reason: any) => any) | null) => void
_then: <TResult1 = TResult, TResult2 = never>(onFulfilled?: ((value: TResult) => TResult1) | null, onRejected?: ((reason: TReason<TFailure>) => TResult2) | null) => CancelablePromise<Awaited<TResult1 | TResult2>, ([TResult2] extends [never] ? TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>
asyncCancel: boolean // @deprecated
bubble: boolean // @deprecated
cancel: (reason?: any, _disposing?: boolean) => CancelablePromise<ISettledResult<unknown>[], never> | void
cancelable: boolean
canceled: boolean
catch: { <R extends PromiseLike<never>>(onRejected: (reason: TReason<TFailure>) => R): CancelablePromise<Awaited<R | TResult>, FailureOf<R>>; <R = never>(onRejected: (reason: TReason<TFailure>) => R): CancelablePromise<Awaited<R | TResult>, FailureOf<R>>; <R = never>(onRejected?: ((reason: TReason<TFailure>) => R) | null): CancelablePromise<Awaited<R | TResult>, FailureOf<R> | TFailure>; }
finally: (onFinally?: (() => PromiseLike<unknown> | void) | null) => CancelablePromise<TResult, TFailure>
forceCancelable: boolean // @deprecated
handleCancel: (onCancel: TOnCancel, options?: IHandleCancelOptions) => CancelablePromise<TResult, TFailure>
isCancelable: boolean // @deprecated
isCanceled: boolean // @deprecated
options: Required<ICancelablePromiseFlagOptions>
shield: boolean // @deprecated
strict: boolean // @deprecated
then: { <TResult1 extends PromiseLike<never>, TResult2 extends PromiseLike<never>>(onFulfilled: (value: TResult) => TResult1, onRejected: (reason: TReason<TFailure>) => TResult2): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<never>, TResult2 = never>(onFulfilled: (value: TResult) => TResult1, onRejected: (reason: TReason<TFailure>) => TResult2): CancelablePromise<Awaited<TResult1 | TResult2>, ([TResult2] extends [never] ? TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<never>, TResult2 = never>(onFulfilled: (value: TResult) => TResult1, onRejected?: ((reason: TReason<TFailure>) => TResult2) | null): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2> | TFailure>; <TResult1 = TResult, TResult2 extends PromiseLike<never> = never>(onFulfilled: ((value: TResult) => TResult1) | null | undefined, onRejected: (reason: TReason<TFailure>) => TResult2): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = TResult, TResult2 = never>(onFulfilled: ((value: TResult) => TResult1) | null | undefined, onRejected: (reason: TReason<TFailure>) => TResult2): CancelablePromise<Awaited<TResult1 | TResult2>, ([TResult2] extends [never] ? TFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = TResult, TResult2 = never>(onFulfilled?: ((value: TResult) => TResult1) | null, onRejected?: ((reason: TReason<TFailure>) => TResult2) | null): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2> | TFailure>; }
```

## `getPromiseImpl` (function)

```text
// @deprecated
(): PromiseConstructor // @deprecated
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
(value: any): value is CancelablePromise<any, unknown>
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

## `makeCancelable<T, TFailure>` (function)

```text
<T, TFailure>(promise: CancelablePromise<T, TFailure>, options?: ICancelableHelperOptions | undefined): CancelablePromise<T, TFailure>
<T>(promise: PromiseLike<T>, options?: ICancelableHelperOptions | undefined): CancelablePromise<T, Unlisted>
```

## `resolvePromiseImpl` (function)

```text
// @deprecated
(options?: IPromiseImplOptions | undefined, staticImpl?: PromiseConstructor | undefined): PromiseConstructor // @deprecated
```

## `setPromiseImpl` (function)

```text
// @deprecated
(impl?: PromiseConstructor | undefined): void // @deprecated
```

## `suppressAbort` (const)

```text
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, Exclude<TFailure, (CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; })>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): void
```

## `suppressCancel<TResult, TFailure, O extends ICatchSuppressOptions = {}>` (function)

```text
<TResult, TFailure, O extends ICatchSuppressOptions = {}>(promise: CancelablePromise<TResult, TFailure>, options?: O | undefined): CancelablePromise<TResult | void, Exclude<TFailure, TSubtractionFlags<O>>>
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
<TResult, TFailure>(promise: CancelablePromise<TResult, TFailure>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, Exclude<TFailure, (CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; })>>
<TResult>(promise: PromiseLike<TResult>, options?: ICancelablePromiseOptions | undefined): CancelablePromise<TResult | void, never>
<TError>(error: TError, options?: ICancelablePromiseOptions | undefined): void
```

## `withFailure<TFirst, TSecond = never, TThird = never, TFourth = never>` (function)

```text
<TFirst, TSecond = never, TThird = never, TFourth = never>(): <TResult>(promise: CancelablePromise<TResult, any>) => CancelablePromise<TResult, Exclude<TFirst, CancelError> | Exclude<TFourth, CancelError> | Exclude<TSecond, CancelError> | Exclude<TThird, CancelError>>
<TMatchers extends readonly [TErrorMatcher, ...TErrorMatcher[]]>(...matchers: TMatchers): <TResult>(promise: CancelablePromise<TResult, any>) => CancelablePromise<TResult, Exclude<MatchedOf<TMatchers>, CancelError>>
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
(error: any): error is (CancelError & { readonly aborted: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:AbortError"; })
```

## `_isTimeoutError` (const)

```text
(error: any): error is ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }
```

## `_isTimeoutLike` (const)

```text
(error: any): error is (CancelError & { readonly timedOut: true; }) | (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; })
```
