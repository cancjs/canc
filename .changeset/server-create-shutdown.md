---
"@cancjs/server-node": minor
"@cancjs/server-express": minor
"@cancjs/server-fastify": minor
"@cancjs/server-koa": minor
"@cancjs/server-hono": minor
---

**Breaking:** `shutdown(server, o)` becomes `createShutdown(server)(o)`. Call `createShutdown` right after `listen()` (fastify takes the instance, hono takes what `serve()` returns) and keep the function it returns for the shutdown path.

Created at startup, the shutdown knows every connection. A connection that never sent a request is closed when the shutdown starts, and every in-flight response carries `Connection: close`, so the drain no longer waits for the grace window to end on an app with no cancel middleware. A shutdown created after connections already exist still completes, but those connections close only when the grace window ends. `createShutdown` returns the same function for the same server, and a second call of that function while the first runs returns the same promise.
