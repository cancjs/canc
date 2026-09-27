# app-axios

An issue tracker API client using Axios, demonstrating how to make Axios request methods return `CancelablePromise` via `@cancjs/axios`.

## What it teaches

1. **Drop-in Axios wrapper.** Wrapping an existing `AxiosInstance` with `cancelableAxios.wrap(instance)` produces an `ICancelableAxiosInstance` where request methods (e.g., `.get()`, `.post()`, `.delete()`) return a `CancelablePromise` instead of a native `Promise`.
2. **Transparent request aborting.** Calling `.cancel()` on the returned promise automatically aborts the underlying network request via `AbortSignal`, with the cancellation propagating cleanly through Axios response interceptors.
3. **Explicit failure signatures.** The returned promises carry declared failure types, such as `CancelablePromise<SearchResult, AxiosError>`, allowing catch blocks to narrow the thrown error type automatically.
4. **Boilerplate reduction.** In contrast to the manual vanilla registry pattern (tracking request IDs, holding `AbortController` instances, and cleanup on settle), the cancelable client simply cancels the previous query promise before triggering the next one.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a npm `file:`.
Build the monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
npm run build
cd examples
npm install
```

## Running both flavors

From the examples root:

```bash
npm run start:vanilla --workspace=app-axios # vanilla: manual abort controller registry
npm run start:canc --workspace=app-axios    # canc: direct promise cancellation
```

Or run the tests:

```bash
npm test --workspace=app-axios
```

## Files to diff

The teaching payload lives in the client twins. Read them side by side:

- `src/issues-client-vanilla.ts` vs `src/issues-client-canc.ts`: manual `AbortController` registration vs simple promise cancellation.
- `src/main-vanilla.ts` vs `src/main-canc.ts`: orchestrating queries where a new search supersedes the in-flight one.

## Honesty note

Axios cancellation aborts the underlying request via `AbortSignal`. This cancels the network connection and prevents processing the response on the client side. However, if the server has already received and started processing the request, network cancellation does not stop database commits or side effects already underway on the server itself.
