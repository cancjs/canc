---
"@cancjs/server-node": patch
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
---

A request now has one deadline. A `timeout` given to the middleware or plugin starts when it runs and reaches plain routes too, where before it waited for a wrapped handler and never fired for a route that was not wrapped. On a plain route the deadline aborts the request signal and runs `onTimeout`, and the route itself still answers. A route's own `timeout` restarts it, longer or shorter, where before the first wrapped layer to arm a deadline won. The deadline ends once the wrapped handler answering the request settles, so a body streamed after the handler returned is no longer cut short or reported as a timeout. `onDisconnect` and `onTimeout` run once per request instead of once per wrapped layer, a request's close listeners stay bounded however many wrapped layers it passes, and Express forwards a cancellation to `next` once per request.
