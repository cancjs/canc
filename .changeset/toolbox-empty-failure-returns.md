---
"@cancjs/toolbox": minor
---

**Breaking:** `cancelify` results and the async iterable terminal operations now declare `unknown` instead of `never`, and the `LazyPromise` family declares `Unlisted` instead of `never`. An annotation `CancelablePromise<T, never>` on one of these needs to widen to `unknown` or `Unlisted`.

Declare failure sets on the prebound `fromAbortSignal`, deferred `cancel()`, `cancelify` and async iterable terminal results.

`fromAbortSignal` returns a promise that never rejects, and the settlement promise from a deferred
`cancel()` cannot reject either. Both carry the failure type `never`. The promises returned by
`cancelify` and by the async iterable terminal operations, including the `pipe` overloads that end
in one, carry `unknown`, because the wrapped function or the source iterable decides what they
reject with.
