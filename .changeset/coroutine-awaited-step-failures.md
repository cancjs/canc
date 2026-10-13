---
"@cancjs/coroutine": minor
---

**Breaking:** A `.catch` reason on a coroutine result narrows to the failures its awaited steps declare, where 1.0 gave `any`. Bodies that read `e.code` or `e.response` on that reason need a fix, listed in the linked section below.

Coroutine results list the failures declared by awaited steps, including library failures such as
timeouts, so a `.catch` reason may narrow where 1.0 gave `any`. See
[failures of awaited library calls](https://github.com/cancjs/canc/tree/master/packages/canc-coroutine#failures-of-awaited-library-calls).
