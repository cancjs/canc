---
'@cancjs/coroutine': minor
---

When a producer's abort signal fires during cleanup started by a consumer return, the return now completes normally after successful cleanup. If cleanup throws, the return rejects with that error.
