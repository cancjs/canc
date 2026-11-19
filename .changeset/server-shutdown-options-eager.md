---
'@cancjs/server-fastify': patch
'@cancjs/server-node': patch
'@cancjs/server-express': patch
'@cancjs/server-hono': patch
'@cancjs/server-koa': patch
---

Fastify's `createShutdown(app, options)` now checks its options when it is called. A `cancelAfter` greater than `closeAfter`, a status outside 200 to 599 or an invalid header throws there, instead of failing inside a later `app.close()`, where a request that never ended kept the close waiting forever. The other server packages already throw when the shutdown function is called with such options; their behavior is unchanged.
