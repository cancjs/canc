---
"@cancjs/toolbox": minor
---

A helper called with `{ lazy: true }` (`delay`, `timeout`, `retry`, `waitFor`, `promisify`) now returns a `LazyPromise`, the same as `LazyPromise.try(() => helper(...))` with the options on the work. The result has `execute()` and `started`, passes `isLazyPromise`, and comes back unchanged from `createLazyPromise`. Its type is `LazyPromise<T, F>` with the failure set of the eager form. A shielded lazy canceled before start now rejects instead of staying pending, and an already aborted signal under `strict` rejects instead of throwing from `.then()`.

`LazyPromise` gains a failure set parameter, `LazyPromise<T, F = unknown>`, read like the one on `CancelablePromise`. `LazyPromise.try(fn)` takes it from what `fn` returns. Canceling the only promise derived from a started lazy now stops its work.
