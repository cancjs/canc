---
"@cancjs/node": patch
---

Allow a canceled task worker to finish cooperative cleanup after acknowledging the stop message instead of terminating it immediately.
