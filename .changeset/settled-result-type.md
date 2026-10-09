---
"@cancjs/promise": minor
---

Add an own `ISettledResult` type for the `allSettled` result.

The emitted declarations named the lib `PromiseSettledResult`, which does not exist for a
consumer compiling with a `lib` older than ES2020. `allSettled` and the `cancel` result now use
`ISettledResult<T>` instead, with the members `ISettledFulfilled<T>` and `ISettledRejected`.
The shape is identical to the lib type, so existing code keeps compiling.
