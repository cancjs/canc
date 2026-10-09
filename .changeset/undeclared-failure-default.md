---
"@cancjs/promise": minor
---

Treat a one argument `CancelablePromise<T>` as a promise whose failure is undeclared.

The default failure type is now `unknown` instead of `never`. Code that compiled against 1.0 with
one argument annotations compiles again, including rejected promises returned where a
`CancelablePromise<T>` is expected and `CancelablePromise.reject<T>(error)`. A promise that
declares nothing is written `CancelablePromise<T, never>`.

The reason passed to `catch` and to the second `then` callback is `any` when the failure is
undeclared or empty, the same as on a native promise. A declared failure keeps its declared reason
type.

Mixing an undeclared promise with declared ones (`all`, `race`, `then`, coroutines) gives an
undeclared result. An undeclared promise is not assignable to a declared failure type; use
`withFailure` or an explicit annotation to declare it.
