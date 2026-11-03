---
"@cancjs/server-hono": patch
---

Raise the peer floors to `hono >=4.8.0` and `@hono/node-server >=1.9.0`, the oldest releases the adapter is tested against.

Older `hono` releases answer an error only through `HTTPException`, so a deadline or shutdown cancellation fell back to a plain `500`. Older `@hono/node-server` releases do not hand the node request and response to the handler, so a disconnect could not be detected.
