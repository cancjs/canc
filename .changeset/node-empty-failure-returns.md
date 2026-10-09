---
"@cancjs/node": minor
---

Declare empty failure sets on the node wrapper return types.

Wrapped fs, dns, crypto, zlib, stream, timers, events, child process, worker and dgram calls now
return `CancelablePromise<T, never>` instead of a promise whose failure reads as undeclared. Callbacks
you pass to the stream visitors and `locks.request` keep their undeclared failure, since your code
decides what they throw. The reason in a `catch` handler stays `any`.
