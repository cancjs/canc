---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

A throttled function no longer invokes twice in quick succession across a window boundary, and flushing a debounced function returns undefined once the trailing invocation has settled and arguments are cleared.
