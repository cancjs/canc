---
"@cancjs/promise": minor
---

Keep the declared failure type in `race()` when an input is a native promise.

`CancelablePromise.race([cancelable, Promise.resolve(3)])` reported a failure of `never`, because the
cancelable member was folded into the native one during inference. Array literals and tuples now
keep every member, so the result carries the declared failure of the cancelable member plus
`Unlisted` for the native one, and a rejection handler receives `any`. Plain arrays of a single
promise type are typed as before.
