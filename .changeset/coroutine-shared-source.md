---
"@cancjs/coroutine": patch
---

Canceling a coroutine no longer cancels a promise it awaits while another coroutine or consumer still waits on that promise. The source is canceled once its last consumer is gone. With an older `@cancjs/promise` that cannot count consumers, the awaited promise is still canceled directly.
