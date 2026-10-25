---
'@cancjs/toolbox': patch
---

`LazyPromise` now drops `CancelError` from its declared failure set, the same as the other carriers, so a lazy promise that declares `CancelError` no longer lists it as a failure.
