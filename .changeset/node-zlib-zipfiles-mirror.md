---
'@cancjs/node': minor
---

**Breaking:** `zipFiles` from `@cancjs/node/zlib` is now node's own synchronous function with node's signature: `[sourcePath, entryName]` pairs in, node's `Readable` of archive bytes out, gated at `26.8.0`. There is no promise to cancel; destroy the returned stream. The per-file directory walker it replaces moves to `@cancjs/node/zlib/extra` as `zipFilesCheckpointed`, which closes the archive when canceled so its file descriptor is released.
