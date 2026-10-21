---
"@cancjs/toolbox": minor
---

**Breaking:** `pipe` no longer accepts a config object anywhere but last, and `pipe`, `concat` and `zip` throw a TypeError for a function argument that is not an operator or terminal, a `null` config, or a class instance in the config slot. Before, these were silently ignored. A trailing `undefined` is still accepted as an unset config. A plain object passed to `concat` or `zip` as a source, rather than last, is rejected instead of being taken for config.
