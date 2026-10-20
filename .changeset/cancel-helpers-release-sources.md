---
"@cancjs/promise": minor
---

**Breaking:** canceling the promise returned by `catchCancel`, `suppressCancel`, `makeCancelable` or an error matcher no longer cancels a cancelable promise that something else still consumes. It is canceled once its last consumer is gone, on the same schedule as a canceled `then` child. Code that relied on the helper canceling a shared source must cancel that source itself.

A helper given an already aborted `signal` now releases its source the same way a later abort does, instead of leaving it running. A third-party cancelable cannot be counted, so the helper still cancels it directly and assumes it is the only holder.
