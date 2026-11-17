---
'@cancjs/coroutine': minor
---

An async coroutine cancel now waits for its registered cancel handlers and returns their settled results. A handler failure appears as a rejected result. Synchronous coroutine cancellation is unchanged.
