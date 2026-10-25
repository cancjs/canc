---
"@cancjs/server-hono": patch
---

A late failure on hono is now logged with `console.error` under the `[@cancjs/server-hono] late failure` prefix, where it was dropped before. A cancellation that arrives after the response head went out on a wrapped route is cut and logged as `[@cancjs/server-hono] response cut after its head was sent`, once per request, and no longer reaches `app.onError`, so `@hono/node-server` stops writing `ERR_HTTP_HEADERS_SENT` to stderr with or without a user `onError`. A cancellation reaching `app.onError` from a route the wrapper does not wrap is logged the same way by `cancelErrorHandler()`.
