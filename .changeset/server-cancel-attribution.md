---
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
"@cancjs/server-node": patch
---

A cancellation the request does not own, such as a `cancel()` the caller made on a live request or a timeout the handler raised itself, is no longer answered with `503`. It goes to the framework's own error handling instead. Deadlines and shutdowns keep the status they carry, and a shutdown's explicit `status` is no longer overridden by the handler's `status` option.
