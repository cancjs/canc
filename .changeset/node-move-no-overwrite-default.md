---
'@cancjs/node': minor
---

`move` and `moveSync` no longer overwrite an existing destination by default, matching fs-extra: they now reject with `EEXIST` unless `{ overwrite: true }` is passed. On Windows, `move` and `replaceFile` now retry a rename that fails with `EPERM` or `EACCES` for about half a second, since antivirus and indexers often hold a file briefly.
