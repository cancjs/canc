---
"@cancjs/promise": patch
---

`suppressCancel` and `catchCancel` no longer swallow a `CancelError` caused by a timeout unless `{ timeout: true }` is passed. Before, the `timeout` option was ignored for that case and a timed out `@cancjs/fetch` request resolved to `undefined`. A plain cancel is still suppressed, and `{ abort: true }` does not widen the match to timeouts.
