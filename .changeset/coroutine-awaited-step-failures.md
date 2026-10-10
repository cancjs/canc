---
"@cancjs/coroutine": minor
---

Coroutine results list the failures declared by awaited steps, including library failures such as
timeouts, so a `.catch` reason may narrow where 1.0 gave `any`. See
[failures of awaited library calls](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine#failures-of-awaited-library-calls).
