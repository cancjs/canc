---
'@cancjs/node': patch
---

`copy`, `move` and their sync forms now reject copying or moving a directory into itself or onto the same path, with the same messages as fs-extra. `ensureLink` and `ensureSymlink` now reject when the destination exists and is not the same link.
