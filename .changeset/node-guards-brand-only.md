---
'@cancjs/node': minor
---

**Breaking:** `isNotImplementedError`, `isProcessExitError`, `isProcessSpawnError` and `isJsonParseError` now match by the package brand alone, like the core guards. A plain object that only carries a matching `name` no longer passes. Errors built by the package classes still match, including ones that crossed a worker thread or came from a second copy of the package.
