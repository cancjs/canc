---
"@cancjs/server-fastify": minor
---

A fastify app no longer needs `setErrorHandler(cancelErrorHandler())` for its wrapped routes: a deadline and a shutdown cancellation are answered with their status by fastify itself. `cancelErrorHandler` takes a new `onError(error, request, reply)` option for the errors that are not cancellations, in place of `reply.send(error)`.

A handler that fails after a cancellation already answered its request is logged at error level through `request.log`, once. A response cut after its head went out is logged the same way, on wrapped routes as well as on `cancelErrorHandler`. The error logged by `createShutdown` when an `onClose` hook throws goes to `app.log` instead of `console.error`.
