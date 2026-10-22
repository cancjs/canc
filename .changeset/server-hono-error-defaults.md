---
"@cancjs/server-hono": patch
---

`cancelErrorHandler()` now logs an ordinary error with `console.error` and answers `500`, as Hono's own default does, where before it rethrew out of `app.fetch` and the error went unlogged. A route that wrote the node response itself and was then canceled no longer makes `@hono/node-server` log `ERR_HTTP_HEADERS_SENT`. The connection is now destroyed on purpose, so the client sees an aborted response instead of a body that looks complete.
