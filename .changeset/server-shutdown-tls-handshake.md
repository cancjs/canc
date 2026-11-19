---
'@cancjs/server-node': patch
'@cancjs/server-express': patch
'@cancjs/server-fastify': patch
'@cancjs/server-hono': patch
'@cancjs/server-koa': patch
---

On an HTTPS server, a shutdown now closes a connection whose client never finished the TLS handshake, under the same rule as a connection that sent nothing. Before, such a connection held the shutdown until `closeAfter` and the result reported `timedOut: true`.
