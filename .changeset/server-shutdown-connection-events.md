---
"@cancjs/server-node": patch
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
---

A shutdown closes each kept-alive connection as soon as the response on it finishes, rather than polling for idle connections on a timer. Every response sent after the shutdown starts carries `Connection: close`, plain routes included, so a client sees the same outcome on its next request whether or not the previous route was wrapped. Requests are known from the first time the package meets the server, at the latest when `createShutdown()` is called.
