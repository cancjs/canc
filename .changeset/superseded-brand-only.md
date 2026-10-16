---
"@cancjs/promise": patch
"@cancjs/toolbox": patch
"@cancjs/toolbox-native": patch
---

`isSupersededError` and an error matcher built from `SupersededError` now match by the prototype brand alone. A plain object or a foreign `Error` that only carries the name `SupersededError` no longer matches. Instances from another copy of the package still match through the shared brand.
