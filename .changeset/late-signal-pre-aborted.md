---
"@cancjs/toolbox": patch
---

An outbound signal first requested after its promise was canceled is now already aborted. This covers `getSignal()` in a `cancelify` function that asks for the signal after an await, and in the `promisify` `transformArgs` and `handleCancel` hooks. Before, such a late call returned a signal that never aborted. In `cancelify` the abort reason is the `CancelError` the promise rejects with.
