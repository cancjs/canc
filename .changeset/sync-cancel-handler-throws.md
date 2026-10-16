---
"@cancjs/promise": patch
---

With `asyncCancel: false`, a cancel handler that throws no longer stops the remaining handlers. A direct `cancel()` call runs all of them and then rethrows the first error. A cancel that arrives from an abort signal, a bubble from canceled children, a canceled parent or a combinator canceling its losers drops handler errors instead of raising an uncaught exception or throwing from an unrelated `cancel()` call.
