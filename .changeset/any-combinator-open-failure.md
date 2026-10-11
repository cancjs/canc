---
"@cancjs/promise": minor
---

Mark the failure of `CancelablePromise.any` as an open set.

`CancelablePromise.any` now returns `CancelablePromise<T, AggregateError | Unlisted>` instead of
`CancelablePromise<T, AggregateError>`. Its rejection handler receives `any`, the same as on
`Promise.any`, so a body such as `.catch((e) => e.code)` compiles as it did on 1.0. The declared
`AggregateError` stays visible in the type. `await.any` inside a coroutine still declares
`AggregateError` only.
