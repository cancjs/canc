---
'@cancjs/toolbox': patch
---

Report a source iterator's close failure when an async-iterator terminal would otherwise complete successfully. Earlier callback failures and cancellation keep their precedence.
