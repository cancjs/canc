---
"@cancjs/promise": minor
---

Add the `Unlisted` type to mark an open failure set.

`CancelablePromise<T, HttpError | Unlisted>` says the promise may reject with `HttpError`, and may also
reject with reasons not listed. A rejection handler on such a promise receives `any`, the same as on a
native promise, while the declared members stay visible in the type. Sets without `Unlisted` read as
before. `Unlisted` is a type only and adds nothing at runtime.
