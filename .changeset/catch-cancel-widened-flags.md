---
"@cancjs/promise": minor
---

Type widened `catchCancel` flag options on the resolution side.

A flag held in a variable widens to `boolean`, as in `const bag = { abort: true }`. Passing such a
bag to `catchCancel` still catches the abort error at runtime, but the result type left it out, so
narrowing the resolved value looked exhaustive when it was not. The result now includes
`AbortError` for a widened `abort` and `TimeoutError` for a widened `timeout`.

The failure channel keeps the stricter rule. A kind is removed from it only when the flag is the
literal `true`, since only then is the catch guaranteed. `suppressCancel` keeps resolving with
`void` and follows the same failure rule.
