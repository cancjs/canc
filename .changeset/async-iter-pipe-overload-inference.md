---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
"@cancjs/fetch": minor
---

The async iterator `pipe` now infers its result type through a full overload ladder instead of a single permissive signature. Chaining operators and an optional terminal, or passing an array-grouped list of operators, now resolves to the concrete element or promise type produced by the chain, with no `any` in the result. Putting a terminal before the end of a chain, or passing more than one terminal, is now a compile error instead of a silent runtime one. Mismatched adjacent operator types resolve to `never` so the error surfaces where the mismatch actually is.
