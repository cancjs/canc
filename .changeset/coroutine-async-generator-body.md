---
"@cancjs/coroutine": patch
---

A coroutine body that is an async generator function no longer freezes the process. `cancAsync` rejects with a `TypeError` when the call is made, and `cancGenAsync` rejects the first pull with the same error. A body that returns a generator-like object without a `return` method is rejected up front as well, instead of failing later when a cancel tries to unwind it. Both drivers also check every step result and reject with a `TypeError` when it is a promise or not an object.
