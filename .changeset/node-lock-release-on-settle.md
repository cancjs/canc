---
'@cancjs/node': minor
---

**Breaking:** A `requestLock` holder whose lock is stolen now rejects `CancelError` instead of node's `AbortError`, which moves to the error's `cause`.

Hold a lock until the body really finishes.

Canceling a `requestLock` holder still rejects at once with `CancelError`, but the lock is now released only when the body's own result settles, so a body that keeps running no longer overlaps the next holder. The body receives an `AbortSignal` as its second argument, aborted on cancel and on steal.
