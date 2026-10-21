---
"@cancjs/coroutine": patch
---

A cancel that lands inside `forAwait`, `forAwait.toArray` or a generator callback of `forAwait` no longer lets the body resume after the helper call, and the loop stops pulling its source. A `forAwait` or `toArray` used inside a `finally` during cancel cleanup now runs to its end, and the rest of that `finally` runs too. In `cancGen.async` producers, a consumer `break` inside `cancGen.delegate` or `cancGen.forAwait` now ends the producer instead of running the code after the helper. A generator of your own whose `finally` awaits still resumes its caller after a cancel; the README describes how to guard against that.
