---
"@cancjs/server-node": patch
"@cancjs/server-express": patch
"@cancjs/server-koa": patch
"@cancjs/server-hono": patch
"@cancjs/server-fastify": patch
---

Validate request timeout status options at setup as integers from 200 to 599 across server adapters while preserving each framework's response handling.
