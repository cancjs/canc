---
"@cancjs/coroutine": minor
---

**Breaking:** The result of a body annotated `AsyncResult<T>` is undeclared, so it no longer fits a `CancelablePromise<T, never>` slot. Use a one argument `CancelablePromise<T>` slot, or declare the failure on the target.

A body annotated with the one argument `AsyncResult<T>` leaves the coroutine failure undeclared, the same as a one
argument `CancelablePromise<T>`, so the result's `.catch` reason is `any`.
