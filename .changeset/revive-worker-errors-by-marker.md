---
"@cancjs/node": patch
---

A canc error thrown in a worker thread comes back on the main side as the same canc class, so `isCancelError`, `isTimeoutError`, `ProcessExitError` (with `exitCode`) and the other node error kinds answer as they do locally. Revival reads the brand marker alone, so a plain error or a foreign class that merely shares a canc name stays as it was, and a `cause` chain is revived the same way.
