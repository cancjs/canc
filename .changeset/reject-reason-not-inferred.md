---
"@cancjs/promise": minor
---

Stop inferring a declared failure from the `CancelablePromise.reject` argument.

`CancelablePromise.reject(new Error('x'))` now declares nothing, so its rejection handler receives
`any`, the same as `Promise.reject`, and a body such as `.catch((e) => e.code)` compiles as it did
on 1.0. To declare the failure, name it, as in
`CancelablePromise.reject<never, HttpError>(error)`, or let an annotated slot supply it:
`const p: CancelablePromise<number, HttpError> = CancelablePromise.reject(error)`. The reason
argument itself is no longer checked against the named failure.
