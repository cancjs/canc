---
'@cancjs/node': minor
---

**Breaking:** Aborting a caller `signal` passed to `on` from `/events` or to a `/zlib` one-shot function now rejects `CancelError` instead of node's `AbortError`.

Apply one rule to a caller `signal` across every subpath.

Wherever the package owns the returned promise, a `signal` in the options is taken off node's options and given to the promise, so aborting it is the same as calling `cancel()`. This now also holds for every pull of an `on` iterator, the `/zlib` one-shot and iterable codec functions, the `/crypto` functions that take an options bag, `/dns`, and `runTask`, which previously ignored the signal or passed it to node. `on` stops listening as soon as the signal aborts, with or without a pull pending. The `stream` wrappers and `timers` now lift the signal on every Node version, including those where node itself takes no signal for that call. `setInterval`, `watch`, `glob` and the child process functions still hand the signal to node untouched, because they return something the caller holds rather than a promise.
