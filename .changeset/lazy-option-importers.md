---
"@cancjs/fetch": patch
"@cancjs/node": patch
---

This package bundles the shared toolbox module, which now builds the result of a `{ lazy: true }` helper call as a lazy promise. Nothing in this package passes that option, so its behavior is unchanged.
