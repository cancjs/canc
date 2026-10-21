---
"@cancjs/toolbox-native": patch
"@cancjs/toolbox": patch
---

Fix `createCatchError` and `createSuppressError` products staying pending forever when an error matcher predicate throws. The returned promise now rejects with the error the predicate raised.
