---
'@cancjs/server-node': patch
'@cancjs/server-express': patch
'@cancjs/server-fastify': patch
'@cancjs/server-hono': patch
'@cancjs/server-koa': patch
---

The registered key a running shutdown is kept under on the server is now `@cancjs/server-node:ShutdownState`, in line with the other keys. A server package from an earlier beta no longer sees a shutdown started by this one, so update all server packages together.
