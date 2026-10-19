---
'@cancjs/node': patch
---

`replaceFile` no longer aborts its own temp-file write when canceled. The temp file is removed only after the write has settled, so a write that lands late cannot leave a `.tmp-` file behind. Cancelation waits for that cleanup; `await promise.cancel()` resolves once the temp file is gone.
