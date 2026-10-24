---
"@cancjs/server-express": patch
"@cancjs/server-node": patch
"@cancjs/server-fastify": patch
---

`cancelErrorHandler({ status })` now throws a `RangeError` when `status` is outside 200 to 599, at the call that creates the handler, the way a shutdown's `status` already does. A status the response cannot carry used to surface only inside a request.
