---
"@cancjs/coroutine": patch
---

Stop registering a cancel handler on the coroutine promise for every step, so long loops no longer grow memory.
