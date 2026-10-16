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

Match error classes only canc produces, such as `CancelError`, by brand alone in constructor matchers, so a foreign error that merely carries the same name no longer matches. An error constructor from another realm is now matched as a constructor instead of being called as a predicate. `AbortError` and `TimeoutError` instances accept a new `name` or `message` by plain assignment.
