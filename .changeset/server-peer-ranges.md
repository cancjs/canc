---
"@cancjs/server-hono": minor
---

**Breaking:** raise the peer floors to `hono >=4.8.0` and `@hono/node-server >=1.9.0`, the oldest releases the adapter is tested against. Users on `hono` 4.0 to 4.7 or `@hono/node-server` 1.0 to 1.8 now get a peer conflict and must upgrade.

Before `hono` 4.8.0 the answer built from an error's `getResponse()` dropped the headers the route and its middleware had set, so a deadline or shutdown answer lost them (4.6 and 4.7 do read `getResponse()` and do answer `503`). `@hono/node-server` before 1.9.0 does not honor the `x-hono-already-sent` marker, so an answer the adapter already sent was written a second time.

There is no adapter-side fix for the 4.7.0 case: the loss is inside hono's own default error handler path, so a fix would need the request context inside `getResponse()`, which is not a small change.
