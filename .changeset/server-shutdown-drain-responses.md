---
"@cancjs/server-node": patch
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
---

A shutdown now waits for in-flight responses to finish, including routes that were never wrapped, and closes remaining connections only when the grace window runs out.
