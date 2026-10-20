---
"@cancjs/promise": patch
---

A `then` child now keeps the `forceCancelable` value its parent had when the child was created, on legacy engines too. Bubble counting covers every chain edge: a `bubble` toggle no longer leaves a live earlier consumer canceled, or a later uncounted consumer blocking the bubble.
