---
"@cancjs/server-node": patch
"@cancjs/server-express": patch
"@cancjs/server-fastify": patch
"@cancjs/server-hono": patch
"@cancjs/server-koa": patch
---

A shutdown no longer waits for websockets or other upgraded connections past the window. Node drops an upgraded socket from its connection list, so the shutdown could not see it and waited until `closeAfter`. Upgraded sockets are now destroyed once the grace window ends and no request is open, and every connection still open at `closeAfter` is destroyed. Close your websockets when shutdown starts; the readiness and websocket notes in each package README show how.
