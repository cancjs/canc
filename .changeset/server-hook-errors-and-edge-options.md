---
"@cancjs/server-node": patch
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
---

An `onDisconnect` or `onTimeout` callback that throws is now logged with `console.error` instead of surfacing as an uncaught exception that ends the process. A `timeout` of `Infinity` on `shutdown()` waits for the responses however long they take, where before it gave up after a millisecond, and a duration past the largest timer delay is held at that limit for both `shutdown()` and the request deadline. `shutdown()` called without a server now throws a `TypeError` that names the missing argument. The README option tables now say that a request `timeout` of `0` fires at once.
