---
'@cancjs/node': patch
---

Fix pipeline arguments, exec stdio, worker subclassing and resolvers. `pipeline` takes a web `WritableStream` or `TransformStream` in last position as the destination, not as options. Canceling `exec` or `spawn` waits for the child to close and destroys its stdio so the parent's event loop is released. `class X extends Worker` instances are `X`. Each `Resolver` query runs on its own node resolver, so canceling one leaves its siblings running. The `zstd` and `zipFiles` gate messages name the release that ships them.
