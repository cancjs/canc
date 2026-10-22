---
"@cancjs/toolbox": patch
---

A lazy promise now applies its promise options to the work it starts. Before, every option other than `impl` and `resettable` was dropped, so `signal`, `shield`, `strict` and the rest had no effect. A signal that aborts before the first subscription cancels the lazy before start, so the executor never runs, and an already aborted signal does the same instead of throwing under `strict`. A reason passed to a cancel before start now follows the `cancel()` rule of a promise: an object reason becomes the `cause` of a new `CancelError` instead of its message. A shielded lazy keeps its work running when canceled after start.
