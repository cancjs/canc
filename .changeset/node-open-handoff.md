---
"@cancjs/node": patch
---

Close native file and directory handles acquired during a canceled open operation when the handle was never delivered to the caller.
