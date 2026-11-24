---
"@cancjs/node": patch
---

Keep cancellation cleanup pending until a spawned child emits close, including when it has already emitted exit, subject to the existing timeout cap.
