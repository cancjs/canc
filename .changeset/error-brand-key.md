---
'@cancjs/promise': patch
'@cancjs/coroutine': patch
'@cancjs/toolbox': patch
'@cancjs/toolbox-native': patch
---

Make AbortError, TimeoutError, SupersededError and IterationError the same type in every package that exports them. Each error prototype now carries a non-enumerable `_cancErrorBrand` string next to its `Symbol.for` brand, and the class types are keyed on that string, so `CancelablePromise<void, TimeoutError>` accepts a TimeoutError from any canc package, including `@cancjs/toolbox-native`.
