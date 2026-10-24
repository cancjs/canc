---
"@cancjs/server-koa": patch
---

A cancellation the koa request owns now reaches koa's error handling instead of being answered in place. The status and headers it carries (a deadline's status, or the shutdown's `status` and `headers`) are applied by koa, and `app.on('error')` receives the cancellation. A disconnect and a response that already finished are still dropped without a write. A cancellation after the head was sent cuts the socket and is rethrown, so `app.on('error')` sees it too. An error body set before the deadline is replaced by koa's text for that status. A `status` or `timeout.status` that koa does not answer with throws a `RangeError` when the middleware or handler is created.
