---
"@cancjs/server-node": minor
"@cancjs/server-express": minor
"@cancjs/server-fastify": minor
"@cancjs/server-hono": minor
"@cancjs/server-koa": minor
---

Declare an empty failure set on the shutdown promise.

`shutdownServer` resolves with a result instead of rejecting, so its promise is now typed
`CancelablePromise<IShutdownResult, never>`. Code that read it as undeclared keeps compiling.
