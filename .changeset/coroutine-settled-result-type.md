---
"@cancjs/coroutine": minor
---

Use the `ISettledResult` type from `@cancjs/promise` for the `allSettled` result.

The emitted declarations no longer name the lib `PromiseSettledResult`, so they compile for a
consumer with a `lib` older than ES2020. The shape is unchanged. This needs `@cancjs/promise`
1.1.0 or newer, which the peer range already requires.
