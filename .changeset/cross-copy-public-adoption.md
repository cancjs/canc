---
"@cancjs/promise": patch
---

A cancelable promise from another installed copy of the package that lacks the internal linking methods is now adopted through its public `then` and `cancel()`, instead of failing with a `TypeError`.
