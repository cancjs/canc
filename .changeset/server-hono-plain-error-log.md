---
"@cancjs/server-hono": patch
---

`cancelErrorHandler()` now logs an error the request does not own the way Hono's own default does, with the bare error passed to `console.error` and no package prefix.
