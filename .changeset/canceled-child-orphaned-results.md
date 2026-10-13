---
"@cancjs/promise": patch
---

Release what a callback returns to an already canceled `then`, `catch` or `finally` promise.

Such a callback still runs when its parent settles, but nothing reads its result. A canceled child now releases the work it returned instead of leaving it running: a cancelable promise it returns is canceled only when nothing else consumes it, and its own `bubble: false` and `shield` options are honored. That cancel carries a fresh bubbled `CancelError`, not the reason the child was canceled with. A returned promise kept alive, and any other returned thenable, gets a silent rejection handler. A `finally` promise canceled before its parent rejects, or whose callback returns a rejected promise, no longer leaves an unhandled rejection behind.
