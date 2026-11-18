---
"@cancjs/promise": minor
---

**Breaking:** `CancelablePromise.allSettled` over an iterable that throws while being read now returns a rejected promise instead of throwing at the call. Move a `try`/`catch` around the call to a rejection handler on the result.

This matches the native `Promise.allSettled`; `all`, `any` and `race` already behaved this way. No input is taken when the iterable throws.
