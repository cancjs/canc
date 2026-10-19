---
"@cancjs/promise": patch
---

Flag setters (`bubble`, `forceCancelable`, and the others) now change only chain edges created after the write. A `then` child keeps the `forceCancelable` value its parent had when the child was created, on legacy engines too, so writes made after that point no longer change it. Bubble counting covers every chain edge: a `bubble` toggle no longer leaves a live earlier consumer canceled, or a later uncounted consumer blocking the bubble.
