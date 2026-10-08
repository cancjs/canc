---
"@cancjs/promise": minor
---

Carry the flagged error types on the `catchCancel` result.

`catchCancel(promise, { abort: true })` resolves with the abort error it caught, and
`{ timeout: true }` resolves with the timeout error, but the declared result type only listed
`TResult | CancelError`. It now reads `TResult | CancelError | AbortError` and
`TResult | CancelError | TimeoutError` respectively, with both kinds present when both flags are
set. The failure channel is unchanged: a flagged kind still leaves it, since it no longer rejects.

Code that narrows the resolved value may see new compile errors. Each one is a case the call could
already hand back at runtime, so the error points at an unhandled value rather than a new one.
`suppressCancel` is unaffected; it resolves with `undefined` and always did.
