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

Packages that cancel with a caller supplied reason, such as a timeout or an abort signal reason, turn a reason that is not already a cancel error into one the same way: an object reason is kept as the error cause, and a primitive reason becomes its message.
