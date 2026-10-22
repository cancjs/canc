---
"@cancjs/toolbox-native": patch
---

`LazyPromise.race` no longer starts an unstarted lazy listed after one that has already settled, since it cannot win.
