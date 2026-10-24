---
"@cancjs/server-node": minor
"@cancjs/server-express": minor
"@cancjs/server-fastify": minor
"@cancjs/server-koa": minor
"@cancjs/server-hono": minor
---

The earlier prereleases shipped `shutdown()`, and that name goes away in this release. Replace `drain()` with the shutdown that `createShutdown()` returns, and rename `IDrainOptions` to `IShutdownOptions` and `IDrainResult` to `IShutdownResult` across all server packages. The graceful shutdown concept is now named consistently with the cancel reason `SERVER_SHUTDOWN` and the JSDoc description.
