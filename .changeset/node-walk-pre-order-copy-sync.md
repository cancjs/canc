---
'@cancjs/node': minor
---

`walk` and `walkSync` with `order: 'depth-first'` now yield in true pre-order: each directory is followed directly by its whole subtree before its next sibling, the order klaw produces. Previously all siblings came first and the subtrees afterwards. `@cancjs/node/fs/extra` also exports `copySync`, the synchronous twin of `copy`, with an `ICopySyncOptions` type whose `filter` must be synchronous.
