---
"@cancjs/server-node": patch
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
---

A request signal or handler first used after its response closed no longer keeps the request in the server's live registry or arms a deadline timer.
