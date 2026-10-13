---
"@cancjs/promise": patch
---

Reclaim what a callback returns to an already canceled `then`, `catch` or `finally` promise.

Such a callback still runs when its parent settles, but nothing reads its result. A cancelable promise it returns is now canceled, and any other thenable it returns gets a silent rejection handler. A `finally` promise canceled before its parent rejects, or whose callback returns a rejected promise, no longer leaves an unhandled rejection behind.
