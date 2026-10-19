---
"@cancjs/promise": patch
---

Deprecate the `getSignal()` method on the executor context in favor of `signal`, and the `asyncCancel`, `forceCancelable`, `bubble`, `strict`, and `shield` setters in favor of passing the option at construction. Nothing changes at runtime.
