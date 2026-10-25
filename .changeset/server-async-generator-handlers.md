---
"@cancjs/server-node": patch
"@cancjs/server-express": patch
"@cancjs/server-koa": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
---

A handler written as an async generator is now rejected with a TypeError that reaches the framework's error path, and the handler types no longer accept one. Before, such a handler was never driven, so Express hung, Koa answered 404 and Fastify answered an empty object. A handler is also no longer invoked when a signal passed in the options is already aborted, and the request is answered as canceled.
