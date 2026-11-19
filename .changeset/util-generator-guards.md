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

Code that runs a generator function as a coroutine now fails with a `TypeError` that names what it received when the result is not a synchronous generator, such as an async generator or an object without `next`, `return` or `throw`. An iterator step that is a promise or not an object fails the same way.
