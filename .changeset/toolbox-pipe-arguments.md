---
"@cancjs/toolbox": patch
---

Fix `pipe` silently ignoring a function argument that is not an operator or terminal, which now throws a TypeError. A config object is only recognised as the last argument, so a plain object passed to `concat` or `zip` as a source is rejected instead of being taken for config.
