---
"@cancjs/promise": patch
---

`CancelError.aborted` and `CancelError.timedOut` now recognize the cause the same way `isAbortError` and `isTimeoutError` do: by brand or by name. A canc `AbortError` or `TimeoutError` cause that was renamed is still recognized, and a cause whose `name` getter throws answers `false` instead of throwing.
