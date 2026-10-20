---
"@cancjs/promise": minor
---

**Breaking:** `all`, `allSettled`, `any` and `race` no longer cancel an input that something else still consumes. Code that relied on a combinator canceling a shared input must cancel that input itself.

Canceling the result of `all`, `allSettled` or `any` now cancels the inputs it holds alone, as `race` already did. A loser of `all`, `any` or `race` is released instead of canceled, so it stops only once its last consumer is gone. A race whose only consumer is canceled now cancels its inputs too.
