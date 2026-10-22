---
"@cancjs/server-node": patch
"@cancjs/server-express": patch
"@cancjs/server-koa": patch
---

A cancellation that arrives after the response head went out now destroys the connection, so a client reading a chunked body sees an aborted response instead of a complete one with a truncated body. Koa drops a body the handler had already set before answering a deadline or shutdown cancellation, so the error status no longer carries the success payload.
