---
"@cancjs/promise": patch
---

Canceling the promise returned by `finally()` no longer cancels the cancelable cleanup its callback returned. The cleanup runs to the end, and a cancel that arrives meanwhile takes effect once it settles, so the `finally` promise rejects with a `CancelError` only after its cleanup is done. A cleanup that rejects wins over that cancel. Before, the cancel reached the cleanup and interrupted it.
