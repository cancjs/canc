---
'@cancjs/node': minor
---

**Breaking:** `zipFiles` from `@cancjs/node/zlib` is now node's own synchronous function with node's signature: `[sourcePath, entryName]` pairs in, node's `Readable` of archive bytes out, gated at `26.8.0`. There is no promise to cancel; destroy the returned stream. `createZipArchive(entries[, options])` likewise returns node's `Readable`, and `createZipArchiveSync` returns node's chunk iterator.

Worker errors: a canc error a worker throws is now revived by its brand key for any canc class, not only the six this package ships. `SupersededError`, `IterationError`, and `BreakError` come back as stand-ins that answer their brand guards; they are not `instanceof` the `@cancjs/toolbox` or `@cancjs/coroutine` classes.
