---
"@cancjs/promise": minor
---

Keep the declared failure type on `catch()` called without a handler.

`catch()`, `catch(null)` and `catch(undefined)` pass the rejection through at runtime, but the result
type dropped the declared failure and reported `never`. They now keep it. A handler that may be
missing, typed as `((reason) => R) | undefined`, adds the declared failure to the handler's own
failure, since the rejection passes through whenever the handler is absent.

Code that assigned such a result to a `CancelablePromise<T, never>` no longer compiles. That
assignment was unsound, because the promise could still reject with the declared failure.
