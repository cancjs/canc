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
TNetworkTypeError | Unlisted
```

## `TCancelableFetchLaterPromise` (type)

```text
asyncCancel: boolean // @deprecated
bubble: boolean // @deprecated
cancel: (reason?: any, _disposing?: boolean) => CancelablePromise<ISettledResult<unknown>[], never> | void
cancelable: boolean
canceled: boolean
catch: { <R extends PromiseLike<never>>(onRejected: (reason: any) => R): CancelablePromise<Awaited<R> | IFetchLaterResultLike, ([R] extends [never] ? TCancelableFetchFailure : never) | FailureOf<R>>; <R = never>(onRejected: (reason: any) => R): CancelablePromise<Awaited<R> | IFetchLaterResultLike, FailureOf<R>>; <R = never>(onRejected?: ((reason: any) => R) | null | undefined): CancelablePromise<Awaited<R> | IFetchLaterResultLike, FailureOf<R> | TCancelableFetchFailure>; }
finally: (onFinally?: (() => PromiseLike<unknown> | void) | null) => CancelablePromise<IFetchLaterResultLike, TCancelableFetchFailure>
forceCancelable: boolean // @deprecated
handleCancel: (onCancel: TOnCancel, options?: IHandleCancelOptions) => CancelablePromise<IFetchLaterResultLike, TCancelableFetchFailure>
isCancelable: boolean // @deprecated
isCanceled: boolean // @deprecated
options: Required<ICancelablePromiseFlagOptions>
readonly [toStringTag]: string
readonly _cancFailure?: TCancelableFetchFailure | undefined
readonly activated: boolean | null
shield: boolean // @deprecated
strict: boolean // @deprecated
then: { <TResult1 extends PromiseLike<never>, TResult2 extends PromiseLike<never>>(onFulfilled: (value: IFetchLaterResultLike) => TResult1, onRejected: (reason: any) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<never>, TResult2 = never>(onFulfilled: (value: IFetchLaterResultLike) => TResult1, onRejected: (reason: any) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? TCancelableFetchFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 extends PromiseLike<never>, TResult2 = never>(onFulfilled: (value: IFetchLaterResultLike) => TResult1, onRejected?: ((reason: any) => TResult2) | null | undefined): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2> | TCancelableFetchFailure>; <TResult1 = IFetchLaterResultLike, TResult2 extends PromiseLike<never> = never>(onFulfilled: ((value: IFetchLaterResultLike) => TResult1) | null | undefined, onRejected: (reason: any) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = IFetchLaterResultLike, TResult2 = never>(onFulfilled: ((value: IFetchLaterResultLike) => TResult1) | null | undefined, onRejected: (reason: any) => TResult2): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, ([TResult2] extends [never] ? TCancelableFetchFailure : never) | FailureOf<TResult1> | FailureOf<TResult2>>; <TResult1 = IFetchLaterResultLike, TResult2 = never>(onFulfilled?: ((value: IFetchLaterResultLike) => TResult1) | null | undefined, onRejected?: ((reason: any) => TResult2) | null | undefined): CancelablePromise<Awaited<TResult1> | Awaited<TResult2>, FailureOf<TResult1> | FailureOf<TResult2> | TCancelableFetchFailure>; }
```

## `TDeferredRequestInit` (type)

```text
{ [x: string]: any; }
activateAfter?: number | undefined
```

## `cancelableFetch` (const)

```text
(input: any, init?: any): CancelablePromise<any, TCancelableFetchFailure>
```

## `cancelableFetchFactory` (const)

```text
(config?: ICancelableFetchConfig | undefined): (input: any, init?: any) => CancelablePromise<any, TCancelableFetchFailure>
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
(input: any, init?: any): CancelablePromise<any, TCancelableFetchFailure>
```
