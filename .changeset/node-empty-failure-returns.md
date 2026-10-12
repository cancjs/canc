---
"@cancjs/node": minor
---

Declare failure sets on the node wrapper return types.

Wrapped calls that pass on a node or platform error now return `CancelablePromise<T, Unlisted>`, an
open failure set. This covers fs, fs-extra, dns, crypto, zlib, stream consumers, `finished`,
`toArray`, events, readline, dgram and the child process `promise`. The reason in a `catch` handler
is `any`, as it was on 1.0, so `.catch((e) => e.code)` compiles. Hovering the result shows that the
set is open. A coroutine awaiting one of these calls lists no failure for that step.

Calls that reject only when canceled return `CancelablePromise<T, never>`: `setTimeout`,
`setImmediate`, `scheduler.wait`, `exists` and `pathExists`.

Calls where your own code decides the rejection return `CancelablePromise<T, unknown>`: the stream
visitors (`every`, `find`, `forEach`, `reduce`, `some`), `pipeline`, `copy` (its `filter` and
`onProgress` callbacks), `writeJson` and `outputJson` (their `replacer`), `requestLock`, `runTask`
and the `Worker` `promise`.
