---
"@cancjs/toolbox-native": patch
---

Fix `debounce` and `throttle` being typed as returning `PromiseLike`, so `.catch()` and `.finally()` now compile on the returned promise. A superseded call nobody subscribed to no longer raises an unhandled rejection, and a caller that awaits it still sees the rejection.
