---
"@cancjs/server-node": minor
"@cancjs/server-express": minor
"@cancjs/server-fastify": minor
"@cancjs/server-koa": minor
"@cancjs/server-hono": minor
---

**Breaking:** `shutdown(server, o)` becomes `createShutdown(server)(o)`. Call `createShutdown` right after `listen()` (fastify takes the instance, hono takes what `serve()` returns) and keep the function it returns for the shutdown path.

Created at startup, the shutdown knows every connection. A connection that has received no bytes is closed when the shutdown starts, while one that has already sent part of a request is left to finish. Every in-flight response carries `Connection: close`, so the drain no longer waits for the grace window to end on an app with no cancel middleware. A connection opened before `createShutdown` is unknown to it: if it has not sent a request, or its response is still in flight, it is closed only when the grace window ends. `createShutdown` returns the same function for the same server. A second call of that function while the first runs returns the same promise, and a call after it settled starts a new run.
