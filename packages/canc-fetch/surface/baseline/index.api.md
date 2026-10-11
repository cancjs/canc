# Public surface: @cancjs/fetch .

Generated. Do not edit by hand.

- Declarations: `packages/canc-fetch/dist/types/index.d.ts`
- Exports: 11

## `ICancelableFetchConfig` (interface)

```text
AbortController?: AbortControllerCtor | undefined
fetch?: Fetch | undefined
```

## `ICancelableFetchLaterConfig` (type)

```text
ITimers | { setTimeout?: undefined; clearTimeout?: undefined; }
AbortController?: AbortControllerCtor | undefined
fetch?: Fetch | undefined
fetchLater?: FetchLater | undefined
pollInterval?: number | undefined
```

## `IFetchLaterResultLike` (interface)

```text
readonly activated: boolean
```

## `TCancelableFetchFailure` (type)

```text
_cancErrorBrand: "@cancjs/promise:TimeoutError"
cause?: unknown
message: string
name: string
stack?: string | undefined
```

## `TCancelableFetchLaterPromise` (type)

```text
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
_subscribe: (onFulfilled?: ((value: IFetchLaterResultLike) => any) | null | undefined, onRejected?: ((reason: any) => any) | null) => void
_then: <TResult1 = IFetchLaterResultLike, TResult2 = never>(onFulfilled?: ((value: IFetchLaterResultLike) => TResult1) | null | undefined, onRejected?: ((reason: ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) => TResult2) | null | undefined) => CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; } : never) | FailureOf<TResult1> | FailureOf<TResult2>>
asyncCancel: boolean
bubble: boolean
cancel: (reason?: any, _disposing?: boolean) => CancelablePromise<PromiseSettledResult<unknown>[]> | void
cancelable: boolean
canceled: boolean
catch: { <R extends PromiseLike<unknown>>(onRejected: (reason: ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) => R): CancelablePromise<Awaited<R> | IFetchLaterResultLike, FailureOf<R>>; <R = never>(onRejected?: ((reason: ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) => R) | null | undefined): CancelablePromise<Awaited<R> | IFetchLaterResultLike, FailureOf<R>>; }
finally: (onFinally?: (() => PromiseLike<unknown> | void) | null) => CancelablePromise<IFetchLaterResultLike, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>
forceCancelable: boolean
handleCancel: (onCancel: TOnCancel, options?: IHandleCancelOptions) => CancelablePromise<IFetchLaterResultLike, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>
isCancelable: boolean // @deprecated
isCanceled: boolean // @deprecated
options: Required<ICancelablePromiseFlagOptions>
readonly [CANCEL_PROMISE_BRAND]: true
readonly [FAILURE]?: (ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) | undefined
readonly [toStringTag]: string
readonly activated: boolean | null
shield: boolean
strict: boolean
then: { <TResult1 extends PromiseLike<unknown>, TResult2 extends PromiseLike<unknown>>(onFulfilled: (value: IFetchLaterResultLike) => TResult1, onRejected: (reason: ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<unknown>, TResult2 = never>(onFulfilled: (value: IFetchLaterResultLike) => TResult1, onRejected?: ((reason: ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) => TResult2) | null | undefined): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; } : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = IFetchLaterResultLike, TResult2 extends PromiseLike<unknown> = never>(onFulfilled: ((value: IFetchLaterResultLike) => TResult1) | null | undefined, onRejected: (reason: ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = IFetchLaterResultLike, TResult2 = never>(onFulfilled?: ((value: IFetchLaterResultLike) => TResult1) | null | undefined, onRejected?: ((reason: ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }) => TResult2) | null | undefined): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; } : never) | FailureOf<TResult1> | FailureOf<TResult2>>; }
```

## `TDeferredRequestInit` (type)

```text
{ [x: string]: any; }
activateAfter?: number | undefined
```

## `cancelableFetch` (const)

```text
(input: any, init?: any): CancelablePromise<any, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>
```

## `cancelableFetchFactory` (const)

```text
(config?: ICancelableFetchConfig | undefined): (input: any, init?: any) => CancelablePromise<any, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>
```

## `cancelableFetchLater` (const)

```text
(input: any, init?: TDeferredRequestInit | undefined): TCancelableFetchLaterPromise
```

## `cancelableFetchLaterFactory` (const)

```text
(config?: ICancelableFetchLaterConfig | undefined): (input: any, init?: TDeferredRequestInit | undefined) => TCancelableFetchLaterPromise
```

## `default` (const)

```text
(input: any, init?: any): CancelablePromise<any, ICancError & { readonly _cancErrorBrand: "@cancjs/promise:TimeoutError"; }>
```
