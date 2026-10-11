---
"@cancjs/node": minor
---

Declare failure sets on the node wrapper return types.

Wrapped fs, dns, crypto, zlib, stream, timers, events, child process and dgram calls now return
`CancelablePromise<T, never>` instead of a promise whose failure reads as undeclared. The stream
visitors (`every`, `find`, `forEach`, `reduce`, `some`), `locks.request` and `runTask` return
`CancelablePromise<T, unknown>`, since the callback or worker you pass decides what they reject
with. The reason in a `catch` handler stays `any`.
