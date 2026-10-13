---
"@cancjs/promise": patch
---

Adopt a non-cancelable thenable the way native promise resolution does.

Its `then` is read once and called in a later job, so the promise settles on the same tick as a native promise would. A `then` that throws, or a `then` getter that throws, rejects the promise instead of throwing from `resolve`. A thenable that resolves with another thenable is adopted in turn, so a `CancelError` arriving that way cancels the promise without an unhandled rejection. The promise now passes the full Promises/A+ test suite.
