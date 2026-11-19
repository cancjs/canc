---
'@cancjs/server-hono': patch
---

A late failure of a signal-only handler and a response cut after its head was sent are now logged the way Hono logs errors, with the bare error passed to `console.error` and no package prefix.
