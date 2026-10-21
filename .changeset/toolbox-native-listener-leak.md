---
"@cancjs/toolbox-native": patch
"@cancjs/toolbox": patch
---

Fix an abort listener staying on a reused signal for every wrapped call whose function throws synchronously.
