---
"@cancjs/axios": patch
"@cancjs/decorators": patch
"@cancjs/fetch": patch
"@cancjs/node": patch
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
"@cancjs/server-node": patch
---

Failure types that were already open show one `Unlisted` marker instead of two. Lazy promise failure types no longer include `CancelError`, and `LazyPromise.fail` rejects with the given error.
