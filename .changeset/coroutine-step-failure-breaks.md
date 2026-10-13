---
"@cancjs/coroutine": minor
---

**Breaking:** Four coroutine bodies that compiled on 1.0 fail to compile when they read the `.catch` reason, because each awaited step now declares its failure. Fix each case as follows:

- `cancAwait.any([...])` step: the reason is `AggregateError`. Type the handler parameter as `any` (`.catch((e: any) => e.code)`), or annotate the result as a one argument `CancelablePromise<T>`.
- `cancAwait(timeout(promise, ms))` over a native or declared input: the reason is `TimeoutError`. Narrow with `isTimeoutError(e)` and rethrow the rest, or annotate the result as a one argument `CancelablePromise<T>`.
- `cancAwait(timeout(promise, ms))` over a one argument input: the same two fixes as the step above.
- `cancAwait(cancelableFetch(url))`: the reason is `TimeoutError`. Narrow with `isTimeoutError(e)` and rethrow the rest, or annotate the result as a one argument `CancelablePromise<T>`.

The narrowed reason can still be a value the set does not list at runtime, so keep the rethrowing fallback. See [failures of awaited library calls](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine#failures-of-awaited-library-calls).
