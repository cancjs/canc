---
"@cancjs/server-fastify": patch
---

`shutdown()` with `closeServer: false` now leaves the instance open instead of calling `app.close()` anyway. When an `onClose` hook throws during the close, the error is logged and `shutdown()` still resolves with the counts, where before it rejected and the counts were lost.
