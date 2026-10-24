---
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
"@cancjs/server-node": patch
---

An error response or an app-set keep-alive during a graceful shutdown now carries `Connection: close`, so the connection is closed after the answer instead of being kept open. An error handler that rebuilds the headers no longer drops that header.
