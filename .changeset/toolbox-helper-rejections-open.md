---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": patch
---

**Breaking:** `map`, `limit`, `debounce` and `throttle` results no longer fit a `CancelablePromise<T, never>` annotation or one naming only the work's failures. Add `Unlisted` (and `AggregateError` for `map`) to such annotations.

These helpers can reject on their own, so their failure set is now open. `map` declares the mapper's failures plus the `AggregateError` it rejects with under `stopOnError: false`, as `F | AggregateError | Unlisted`. A `limit`ed call, a `debounce`d call and a `throttle`d call declare the work's failures as `F | Unlisted`. The cancellation a dropped job or a superseded call rejects with is not listed. A `catch` reason on these results is `any`, and a coroutine step over `map` declares `AggregateError`. `@cancjs/toolbox-native` results stay a plain `Promise<T>`.
