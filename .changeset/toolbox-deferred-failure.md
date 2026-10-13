---
"@cancjs/toolbox": minor
---

Type the promise of `ICancelableDeferred` as `CancelablePromise<T, never>`.

The deferred declares no failure, matching the base deferred type. This follows the new
`@cancjs/promise` default, where a one argument `CancelablePromise<T>` reads as an undeclared
failure.
