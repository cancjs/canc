---
"@cancjs/promise": minor
---

**Breaking:** A native promise reads as `Unlisted`, so `race`, `all` and `resolve` over a native member, and `makeCancelable` of a native promise, no longer fit a `CancelablePromise<T, never>` slot. Declare `| Unlisted` on the slot.

Read a native promise or a foreign thenable as an open failure set.

`FailureOf` of a promise that declares no failure, such as `Promise<number>`, is now `Unlisted`
instead of `never`. A combinator or handler that takes one, as in
`CancelablePromise.race([cancelable, Promise.resolve(3)])`, keeps the declared members and adds
`Unlisted`, so its rejection handler receives `any`, the same as on the native promise.
`makeCancelable(promise)` returns `CancelablePromise<T, Unlisted>` for a native promise and keeps
the declared failure of a cancelable one. `FailureOf<any>` is `never`, so a handler returning `any`
no longer widens the chain.
