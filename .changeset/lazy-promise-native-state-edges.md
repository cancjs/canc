---
"@cancjs/toolbox-native": patch
---

`LazyPromise.all`, `allSettled`, `any` and `race` work with a `signal` option instead of rejecting with a `TypeError`. `finally` awaits a thenable returned by its callback, so a rejection there rejects the result instead of escaping as an unhandled rejection.
