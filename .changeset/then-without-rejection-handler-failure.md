---
"@cancjs/promise": minor
---

Keep the declared failure type on `then()` when the rejection handler may be missing.

A rejection handler typed as `((reason) => R) | undefined` or `| null`, as in `then(onFulfilled, maybeHandler)` or
`then(null, maybeHandler)`, passes the rejection through at runtime whenever it is absent. The result type dropped the
declared failure and reported only the handler's own failure. It now adds the declared failure, the same as `catch()`
does with a handler that may be missing. A handler that is always present still replaces the declared failure.

Code that assigned such a result to a `CancelablePromise<T, never>` no longer compiles. That assignment was unsound,
because the promise could still reject with the declared failure.
