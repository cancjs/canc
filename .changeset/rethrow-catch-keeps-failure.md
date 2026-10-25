---
"@cancjs/promise": patch
---

A `catch` handler that rethrows or translates the error now keeps the declared failure in the list, alongside any undeclared one, instead of dropping it to `never`.
