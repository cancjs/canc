---
"@cancjs/toolbox-native": patch
---

A lazy promise now builds its work promise with its own options, instead of binding the signal separately. Abort behavior is unchanged.
