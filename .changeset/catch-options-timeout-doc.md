---
"@cancjs/promise": patch
---

The documentation of the `abort` and `timeout` options of `catchCancel` and `suppressCancel` now states that a cancellation caused by a timeout is caught only with `timeout: true`, and that one caused by an abort is caught without `abort`.
