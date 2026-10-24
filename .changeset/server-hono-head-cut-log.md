---
"@cancjs/server-hono": patch
---

A late failure on hono is now logged with `console.error` under the `[@cancjs/server-hono] late failure` prefix, where it was dropped before. A cancellation that arrives after the response head went out is logged as `[@cancjs/server-hono] response cut after its head was sent` when the connection is destroyed, once per request, and is forwarded to `app.onError` once.
