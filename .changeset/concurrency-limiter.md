---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

(toolbox) Add `limit`, a concurrency limiter that runs at most N jobs at once and queues the rest. Canceling a job's promise while it is queued drops it before it ever runs; canceling it once it started cancels the job itself. `limited.cancel()` drops the queue and stops what is running, and every promise handed out settles either way. On the native twin there is nothing to cancel, so `limited.cancel()` rejects the queued jobs and leaves the running ones to finish.
