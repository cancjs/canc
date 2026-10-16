---
"@cancjs/promise": patch
---

Cancellation now works when zone.js (Angular) or a Promise polyfill such as es6-promise is loaded before this package. A derived promise from `then`, `catch` or `finally` is canceled when its parent is, reports its settled state once it settles, and ignores a `cancel()` that comes after it settled. Before, these implementations settled derived promises through their own internals, so the derived promise stayed cancelable and ran its cancel handlers even after it had settled.
