---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

**Breaking:** `timeout`, `delay`, `minDelay`, `retry`, `limit`, `map`, `debounce`, the error matchers built by `createCatchError` and `createSuppressError`, and the async iterator callbacks no longer cancel a cancelable promise input that something else still consumes. A helper that stops releases its interest in the input instead, so the input is canceled once its last consumer is gone, on the same schedule as a canceled `then` child. A `.catch` attached to the input counts as a consumer. Code that relied on a helper canceling a shared input must cancel that input itself.

A released input is canceled with a bubbled `CancelError`, so the reason passed to the helper's `cancel()`, or the `TimeoutError` of a missed deadline, is not forwarded to it. Any other object with a `cancel` method cannot be counted, so the helper still cancels it directly with that reason and assumes it is the only holder.
