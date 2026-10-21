---
"@cancjs/toolbox": patch
---

Fix async iterator operators hanging when a callback returns an async generator object, which now rejects with a TypeError. A callback returning a built-in iterator such as `array.values()` now yields that value as data instead of running it as a generator body.
