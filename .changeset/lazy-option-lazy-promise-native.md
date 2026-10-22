---
"@cancjs/toolbox-native": minor
---

A helper called with `{ lazy: true }` (`delay`, `timeout`, `retry`, `waitFor`, `promisify`) now returns a `LazyPromise`, the same as `LazyPromise.try(() => helper(...))` with the options on the work. The result no longer carries a `cancel` method that did nothing.
