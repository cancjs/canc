---
"@cancjs/toolbox": patch
---

Fix `withSignal` calling the function and leaving its rejection unhandled when the signal is already aborted. It now rejects with the abort reason without calling the function.
