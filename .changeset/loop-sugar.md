---
"@cancjs/coroutine": minor
---

Add an argument-free `cancForAwait.next()` loop advance. This targets the innermost open loop in the coroutine, avoiding the need to manually store and advance a handle reference for common loop cases.
