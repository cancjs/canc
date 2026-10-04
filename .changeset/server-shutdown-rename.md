---
"@cancjs/server-node": major
"@cancjs/server-express": major
"@cancjs/server-fastify": major
"@cancjs/server-koa": major
"@cancjs/server-hono": major
---

Rename `drain()` to `shutdown()`, `IDrainOptions` to `IShutdownOptions`, and `IDrainResult` to `IShutdownResult` across all server packages. The graceful shutdown concept is now named consistently with the cancel reason `SERVER_SHUTDOWN` and the JSDoc description. Internal state and utilities renamed to match.
