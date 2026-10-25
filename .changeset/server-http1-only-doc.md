---
"@cancjs/server-node": patch
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
---

The READMEs state that HTTP/1.1 and HTTPS are supported and HTTP/2 is not yet. A request served over the HTTP/2 compatibility API is now dropped from the live request set when its response ends.
