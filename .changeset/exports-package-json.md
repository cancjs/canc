---
"@cancjs/promise": patch
"@cancjs/coroutine": patch
"@cancjs/fetch": patch
"@cancjs/axios": patch
"@cancjs/decorators": patch
"@cancjs/toolbox": patch
"@cancjs/toolbox-native": patch
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
"@cancjs/server-node": patch
"@cancjs/node": patch
"@cancjs/unhandled-rejection": patch
---

Expose `package.json` through the `exports` map, so `require('@cancjs/<name>/package.json')` and tools that read the manifest keep working.
