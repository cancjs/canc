---
"@cancjs/promise": minor
---

**Breaking:** the options passed to `all`, `allSettled`, `any` and `race` now apply to the returned promise only. Inputs are not reconfigured (a `CancelablePromise` input keeps its own flags), so `shield`, `bubble: false` and `forceCancelable: false` on the result no longer stop losers from being released, and a `signal` adds one abort listener instead of one per input.

An already aborted `signal` now releases the inputs the same way a later abort does: an input nothing else consumes is canceled, a shared one keeps running.
