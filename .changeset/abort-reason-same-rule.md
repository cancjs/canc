---
"@cancjs/promise": patch
---

A promise canceled through an `AbortSignal` now treats the abort reason the same way whether the signal was already aborted at construction or aborts later. Cancel handlers receive the raw abort reason, and the rejection follows the `cancel()` rule: a `CancelError` reason is used as is, any other object becomes the `cause` of a new `CancelError`, a string becomes its message. Before, an already aborted signal wrapped every reason, a `CancelError` included, in a new `CancelError` and handed that wrapper to late cancel handlers. The executor's `getSignal()` now aborts with the `CancelError` the promise rejects with, and a first call after the promise was canceled returns an already aborted signal instead of one that never aborts.
