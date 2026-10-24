---
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
"@cancjs/server-node": patch
---

A request cut short by a graceful shutdown now answers `503` on express, fastify and koa when no error handler is mounted, where it answered `500` before. Node already answered `503`. Hono keeps its `500` in that case, since its default error handler reads no status. On every package, an error handler's `status` option applies to a shutdown cancellation as well, which this entry clarifies, so a handler configured with another status gets it instead of the stamped default.
