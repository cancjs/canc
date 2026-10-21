---
"@cancjs/toolbox": patch
"@cancjs/toolbox-native": patch
---

Fix `delay(promise, ms)` reporting an unhandled rejection when the input rejects before the timer fires and the caller handles the result. `delay(promise, undefined)` now keeps the input instead of dropping it.
