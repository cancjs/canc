---
"@cancjs/promise": patch
---

Flag setters (`bubble`, `forceCancelable`, and the others) now change only chain edges created after the write. A `then` child keeps the `forceCancelable` value its parent had when the child was created, so writes made after that point no longer change it.
