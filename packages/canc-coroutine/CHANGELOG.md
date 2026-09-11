# @cancjs/coroutine

## 1.1.0

- Add `canc.throw` and `cancGen.throw` yieldable error helpers for coroutines.
- Infer declared failure sets on promises and generators returned by `canc.async` and `cancGen.async`.
- Add failure type parameter to `AsyncResult<TResult, TFailure>` and `AsyncGenResult<TEmit, TReturn, TFailure>`.
- Thread declared failures through `cancAwait` combinators and loop helpers.
- Document generator return-type annotation requirements for bare yield expressions.

## 1.0.0

Initial release.
