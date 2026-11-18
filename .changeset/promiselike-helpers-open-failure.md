---
"@cancjs/promise": minor
---

**Breaking:** An annotation `CancelablePromise<T, never>` on the result of a catch or suppress helper over a native or foreign promise needs `Unlisted` in place of `never`. A raw `.catch` is unaffected.

Over a native or foreign promise, `catchCancel`, `suppressCancel`, `catchErrors`, `suppressErrors`, `catchAbort`, `catchTimeout`, `suppressAbort`, `suppressTimeout` and the helpers built by `createCatchError` and `createSuppressError` now declare an open failure set, `Unlisted`. Such a promise can reject with anything, so the result can reject too, which `never` denied. A cancelable promise input keeps its declared set as before.
