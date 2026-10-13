---
"@cancjs/promise": minor
---

`setPromiseImpl` now throws a `TypeError` unless it receives a promise class whose prototype has `then` and `cancel`, so a misconfigured registration fails at startup instead of on first use.
