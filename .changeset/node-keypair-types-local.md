---
'@cancjs/node': patch
---

Declare the `generateKeyPair` option shapes inside the package instead of importing them from `@types/node`. Current `@types/node` releases no longer export those names, which broke `@cancjs/node/crypto` types for a default install. `saltLength` is now typed as a number, as node requires.
