---
'@cancjs/server-node': patch
'@cancjs/server-express': patch
'@cancjs/server-fastify': patch
'@cancjs/server-hono': patch
'@cancjs/server-koa': patch
---

Build for ES2022 instead of downleveling to ES5. Every supported Node release runs ES2022 natively, so the generator and async helpers are gone from the bundles.
