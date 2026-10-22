---
"@cancjs/server-fastify": patch
"@cancjs/server-koa": patch
---

The fastify `cancelErrorHandler` option for the status of a canceled request is now `status`, matching express and hono. Koa `cancelMiddleware` accepts the same `status` option instead of always answering 503.
