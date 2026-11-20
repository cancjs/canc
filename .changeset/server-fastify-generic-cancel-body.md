---
'@cancjs/server-express': minor
'@cancjs/server-fastify': minor
'@cancjs/server-hono': minor
'@cancjs/server-koa': minor
'@cancjs/server-node': minor
---

**Breaking:** Request deadline and shutdown cancellations now have the message `Request canceled`. The original deadline message or shutdown reason is available as `error.cause.message` for logs and error handlers.

Fastify's default error body carries the generic message, with or without `cancelPlugin`. Custom error handlers retain control of their response body and can choose to include the cause's message.
