---
"@cancjs/node": patch
---

Canceling a node wrapper now tears its source down: a stream terminal on an idle stream destroys it, `setInterval` settles at once, a file handle closes, a `runTask` worker stops once its result is in, and a codec that stops early calls its source's `return()`. A codec whose `return()` rejects no longer leaves an unhandled rejection behind on cancel. `destroyOnCancel: false` documents that the read already in flight is abandoned.
