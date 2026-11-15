---
"@cancjs/promise": minor
---

**Breaking:** A subclass of `CancelablePromise` that used an underscore-prefixed member in its types now gets a type error because those members are internal. `FAILURE` is now the string `'_cancFailure'`.

The published types of `CancelablePromise` list only its public members, and a string property carries the declared failure type. Two copies of `@cancjs/promise` now produce assignable promise types and preserve declared failures across copies. This also applies when an ES module app and a CommonJS library use the declarations of one copy under `"module": "nodenext"`. At runtime, `isCancPromise` checks the brand on the prototype.
