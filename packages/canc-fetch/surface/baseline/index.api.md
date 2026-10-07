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
ICancelableFetchConfig & (TTimersOverride & { fetchLater?: FetchLater; pollInterval?: number; })
```

## `IFetchLaterResultLike` (interface)

```text
readonly activated: boolean
```

## `TCancelableFetchFailure` (type)

```text
_cancErrorBrand: any
cause?: unknown
message: string
name: string
stack?: string | undefined
```

## `TCancelableFetchLaterPromise` (type)

```text
readonly activated: boolean | null
```

## `TDeferredRequestInit` (type)

```text
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
