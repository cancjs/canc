---
"@cancjs/server-hono": patch
---

Stop `@hono/node-server` 2 from logging `ERR_HTTP_HEADERS_SENT` each time a response is cut after its head was sent.

The 499 answer handed back behind a reply the route already wrote is now built so the server honors its
`x-hono-already-sent` marker. Nothing changes on the wire, and `@hono/node-server` 1 behaves as before.
