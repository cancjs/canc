---
"@cancjs/coroutine": minor
---

`cancAsync(fn, null, options)` now treats a `null` context like an omitted one, so the generator runs with the `this` of the call. Before, `null` became the generator's `this`.
