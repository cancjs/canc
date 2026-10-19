---
"@cancjs/promise": patch
---

Deprecate the promise implementation registry (`setPromiseImpl`, `getPromiseImpl`, `resolvePromiseImpl`, `PromiseImpl`, `IPromiseImplOptions`). Use `CancelablePromise` directly; the registry keeps working through 1.x and is removed in the next major.
