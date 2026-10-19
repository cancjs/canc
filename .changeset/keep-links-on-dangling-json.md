---
'@cancjs/node': patch
---

`writeJson` and `outputJson` keep a dangling symlink and write its target instead of replacing the link with a file.
