---
"@cancjs/server-node": patch
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
---

Type the internal shutdown state as an empty failure set.

The shutdown promise kept by the shared server code resolves with a result and never rejects, so it
is now typed `CancelablePromise<IShutdownResult, never>` internally. No public type changes:
`shutdownServer` still returns `Promise<IShutdownResult>`.
