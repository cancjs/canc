---
"@cancjs/promise": patch
---

A `catch` handler that rethrows now keeps the failure type declared by the promise instead of dropping it to `never`.
