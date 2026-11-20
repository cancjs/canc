---
'@cancjs/server-node': patch
'@cancjs/server-express': patch
'@cancjs/server-fastify': patch
'@cancjs/server-hono': patch
'@cancjs/server-koa': patch
---

The cancel signal made for a Web `Request` stops listening to the request's own signal once it has been aborted, for example by a deadline, so a request object whose signal outlives the request no longer collects listeners.
