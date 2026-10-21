---
"@cancjs/fetch": patch
---

Copying the request options now reads each member once, so a getter runs a single time, and an own `__proto__` key from `JSON.parse` no longer changes the prototype of the copy.
