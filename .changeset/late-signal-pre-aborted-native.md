---
"@cancjs/toolbox-native": patch
---

An outbound signal first requested after its promise was canceled is now already aborted, for the `promisify` `transformArgs` and `handleCancel` hooks. Before, such a late call returned a signal that never aborted.
