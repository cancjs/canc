---
"@cancjs/axios": patch
"@cancjs/coroutine": patch
"@cancjs/decorators": patch
"@cancjs/fetch": patch
"@cancjs/node": patch
"@cancjs/promise": patch
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
"@cancjs/server-node": patch
"@cancjs/toolbox": patch
"@cancjs/toolbox-native": patch
---

Protect shared error guards and compiled error matchers against throwing property reads on hostile errors, treating thrown property access errors as non-matching.
