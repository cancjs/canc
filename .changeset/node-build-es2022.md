---
'@cancjs/node': patch
---

Build for ES2022 instead of downleveling to ES5. Every supported Node release runs ES2022 natively, so the generator and async helpers are gone and the bundles are more than a quarter smaller.
