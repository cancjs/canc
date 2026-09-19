---
"@cancjs/server-node": minor
"@cancjs/server-express": minor
"@cancjs/server-fastify": minor
"@cancjs/server-koa": minor
"@cancjs/server-hono": minor
---

These packages have never been published, so the rename removes no released name. Rename `drain()` to `shutdown()`, `IDrainOptions` to `IShutdownOptions`, and `IDrainResult` to `IShutdownResult` across all server packages. The graceful shutdown concept is now named consistently with the cancel reason `SERVER_SHUTDOWN` and the JSDoc description. Internal state and utilities renamed to match.
