---
"@cancjs/server-node": patch
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
---

`shutdown()` no longer cancels in-flight handlers when it starts. Every request, including one arriving on a kept-alive connection during the shutdown, runs until the grace window ends, and only the handlers still running then are canceled with the shutdown reason (a response not started yet can still answer `503`). A wrapped handler now gets the same chance to finish as a plain route. The new `cancelOnStart: true` option restores the immediate cancel, for long-lived responses such as server-sent events or long polling.
