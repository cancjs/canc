---
'@cancjs/node': patch
---

`runTask` names a worker started with `eval` as `[eval]` in the `ProcessExitError` it rejects with, instead of the whole source text.
