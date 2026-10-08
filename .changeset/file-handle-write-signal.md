---
'@cancjs/node': patch
---

Forward the abort signal to file handle writes on Node 18 and 20, so a canceled write stops instead of running to completion.
