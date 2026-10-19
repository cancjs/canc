---
'@cancjs/node': patch
---

Keep canc error identity across worker threads: `runTask` and `Worker`'s `promise` now reject a `CancelError`, `TimeoutError`, `ProcessExitError`, `ProcessSpawnError`, `JsonParseError`, or `NotImplementedError` thrown in the worker as that class again, so `isCancelError` and the other guards hold on the caller's side. Message, cause, stack and own properties are kept. Other errors are unchanged.
