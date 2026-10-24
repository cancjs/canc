---
"@cancjs/server-hono": patch
---

A deadline or a shutdown cancellation on hono now answers with its status and headers when no `onError` is mounted. Before, hono's default error answer turned it into a `500`.
