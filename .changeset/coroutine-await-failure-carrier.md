---
"@cancjs/coroutine": minor
---

`cancAwait` and the loop handle steps yield a failure carrier type instead of the awaited value, so a declared
failure is no longer dropped next to a native promise step, and an `AsyncResult<T, E>` body can await a native
promise. A body annotated with the awaited value as its yield type moves to `AsyncResult`.
