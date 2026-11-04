---
"@cancjs/promise": minor
---

**Breaking:** A subclass of `CancelablePromise` that used an underscore-prefixed member in its types no longer sees it, since those members are internal. `FAILURE` is now the string `'_cancFailure'` instead of a symbol; it only ever served as a type-level key.

The published types of `CancelablePromise` now list only its public members, and the declared failure is keyed by a string property. Two copies of `@cancjs/promise`, such as a library's and the application's at different versions, or the CommonJS and ES module declarations of one copy under `"module": "nodenext"`, now produce assignable promise types, and a declared failure carries over between them. Nothing changes at runtime: the brand `isCancPromise` checks stays on the prototype.
