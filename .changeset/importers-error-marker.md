---
"@cancjs/axios": patch
"@cancjs/coroutine": patch
"@cancjs/decorators": patch
"@cancjs/fetch": patch
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
"@cancjs/server-node": patch
"@cancjs/toolbox": patch
"@cancjs/toolbox-native": patch
---

Canc error classes now tag as a plain Error for structured clone and carry their brand key as a string marker; this package bundles the shared error module, so it picks up that change.
