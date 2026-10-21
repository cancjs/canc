---
"@cancjs/axios": patch
---

A response interceptor that returns one shared object for several requests no longer hands the next interceptor the context of the first request that returned it. Such an object now gets the detached context, so `ctx.cancel()` can no longer cancel a different request.
