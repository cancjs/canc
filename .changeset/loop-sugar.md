---
"@cancjs/coroutine": minor
---

(coroutine) Add an argument-free advance for the loop handle. `cancForAwait.next()` yields with `[Symbol.for('@cancjs/coroutine:currentLoop')]` to target the innermost-entered open loop in the registry, avoiding the need to store a handle reference for simple single-loop cases.
