---
"@cancjs/toolbox": minor
---

Declare empty failure sets on the prebound `fromAbortSignal` and deferred `cancel()` results.

`fromAbortSignal` returns a promise that never rejects, and the settlement promise from a deferred
`cancel()` cannot reject either. Both now carry the failure type `never` instead of reading as
undeclared.
