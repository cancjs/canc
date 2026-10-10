---
"@cancjs/coroutine": minor
---

A body annotated with the one argument `AsyncResult<T>` leaves the coroutine failure undeclared, the same as a one
argument `CancelablePromise<T>`, so the result's `.catch` reason is `any`.
