---
'@cancjs/node': minor
---

**Breaking:** `zipFiles` from `@cancjs/node/zlib` is now node's own function, promisified, with node's signature and the `26.8.0` gate. The per-file directory walker it replaces moves to `@cancjs/node/zlib/extra` as `zipFilesCheckpointed`, which closes the archive when canceled so its file descriptor is released.
