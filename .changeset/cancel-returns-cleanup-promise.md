---
"@cancjs/promise": patch
---

In awaitable cancel mode, `cancel()` now always returns a promise. On a settled or shielded promise it resolves with an empty list. A second `cancel()` or `[Symbol.asyncDispose]()` while cleanup is still running waits for that cleanup. A `cancel()` called while another cancel is running returns a promise for its own cleanup. `await race.cancel()` also waits for the cleanup of inputs canceled after the race settles. `makeCancelable`, `catchCancel` and `suppressCancel` wait for the cleanup promise returned by the wrapped promise's `cancel()`, and a cancel that reaches a promise from another copy of the package waits for its cleanup.
