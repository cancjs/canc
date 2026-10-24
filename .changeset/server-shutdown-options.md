---
"@cancjs/server-node": minor
"@cancjs/server-express": minor
"@cancjs/server-fastify": minor
"@cancjs/server-hono": minor
"@cancjs/server-koa": minor
---

The shutdown option `timeout` is now `cancelAfter`, the millisecond point at which in-flight handlers are canceled. The new `closeAfter` option is the point at which the shutdown gives up waiting. `cancelOnStart: true` is now `cancelAfter: 0`. Without `closeAfter`, `cancelAfter: 0` leaves a 1 second window, where `cancelOnStart` kept the 10 second default. A `cancelAfter` greater than `closeAfter` throws a `RangeError`. Request deadlines (`timeout` on handlers and plugins) are unchanged.
