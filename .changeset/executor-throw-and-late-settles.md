---
"@cancjs/promise": patch
---

Settle an executor throw and late `resolve`/`reject` calls through the promise state.

A synchronous throw in the executor now leaves the promise rejected and no longer cancelable, so a
later `cancel()` does not mark it canceled or run its cancel handlers, and no abort listener stays
on its `signal`. Throwing a `CancelError` there cancels the promise, the same as passing it to
`reject`. Once a promise is no longer pending, its `resolve` and `reject` do nothing. A promise born
canceled by an aborted `signal` therefore always rejects with a `CancelError`, also when the
`withResolvers` settlers are called right away or `all`, `allSettled` or `any` get no inputs.
