---
'@cancjs/node': patch
---

`replaceFile` now rejects with the original write error when removing its temp file fails as well, matching `replaceFileSync`, instead of surfacing the cleanup error. Both `replaceFile` and `replaceFileSync` reject the append flags (`a`, `a+`, and so on) with a `TypeError` rather than silently discarding the existing content.
