---
'@cancjs/node': patch
---

Make `writeJson` and `outputJson` replace the file atomically, so a canceled write leaves the existing file intact, and make `ensureDir` and `ensureDirSync` reject with ENOTDIR when the path is an existing file.
