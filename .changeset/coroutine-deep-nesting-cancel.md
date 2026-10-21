---
"@cancjs/coroutine": patch
---

Canceling a deeply nested coroutine no longer overflows the stack. A coroutine that awaits another coroutine, such as a tail-recursive poll or retry loop, used to forward the cancel by recursion, so a nest a few thousand levels deep threw a `RangeError` and left the inner levels running. Both `canc.async` and `cancGen.async` now walk the nest in a loop, with the inner levels unwinding before the levels that await them, as before.
