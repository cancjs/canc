---
"@cancjs/toolbox": minor
---

**Breaking:** A coroutine or a combinator that awaits a `pipe` result or a terminal operation now keeps the failures declared by its other members, so a rejection handler that saw `any` may now see a typed reason. An annotation `CancelablePromise<R, unknown>` on such a result still compiles.

The terminal operations of the async iterator helpers (`toArray`, `reduce`, `find`, `some`, `every`, `includes`, `forEach`) and every `pipe` that ends in one now declare an open failure set, `Unlisted`, in place of the undeclared `unknown`. An undeclared member erased the whole failure union of a coroutine that awaited it; an open member leaves the declared failures visible.
