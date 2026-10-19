---
"@cancjs/promise": minor
---

The executor context gains a `signal` property, so an executor can take the abort signal by destructuring: `new CancelablePromise((resolve, reject, { signal }) => fetch(url, { signal }).then(resolve, reject))`. It returns the same signal as `getSignal()` and creates the `AbortController` only when read. It is an inherited non-enumerable getter, so `Object.keys`, spread, `JSON.stringify` and `util.inspect` neither list it nor create the controller.
