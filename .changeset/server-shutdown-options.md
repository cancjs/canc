---
"@cancjs/server-node": minor
"@cancjs/server-express": minor
"@cancjs/server-fastify": minor
"@cancjs/server-hono": minor
"@cancjs/server-koa": minor
---

The shutdown option `timeout` is now `cancelAfter`, the millisecond point at which in-flight handlers are canceled. The new `closeAfter` option is the point at which the shutdown gives up waiting. `cancelOnStart: true` is now `cancelAfter: 0`. Without `closeAfter`, `cancelAfter: 0` leaves a 1 second window, where `cancelOnStart` kept the 10 second default. A `cancelAfter` greater than `closeAfter` throws a `RangeError`. Request deadlines (`timeout` on handlers and plugins) are unchanged.

Breaking: after `cancelAfter`, a request canceled by the shutdown can still answer, for example with `503`, before its connection closes. The window ends when every request and connection is done, or at `closeAfter`. A request the shutdown did not cancel also runs until `closeAfter`. `canceled` counts requests the shutdown canceled, `completed` requests that finished normally, and `timedOut` is set when `closeAfter` ends the window with a request or connection still open.
The shutdown options `status` and `headers` set the answer each request the shutdown cancels gets, for example `503` with a `Retry-After` header. `status` takes precedence over a handler's `status` option for these cancellations, and a deadline keeps the status it was given. Hono picks up `headers` in a later change.
