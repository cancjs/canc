---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": patch
---

**Breaking:** An annotation `CancelablePromise<T, TimeoutError | Unlisted>` on `timeout(input, ms)` over an input that declares failures needs those failures added.

`timeout(input, ms)` keeps the failures of a promise input next to its own `TimeoutError | Unlisted`. A `CancelablePromise<T, HttpError>` input gives `HttpError | TimeoutError | Unlisted`, an input with no declared failure type gives an undeclared result, and a native promise input still gives `TimeoutError | Unlisted`. A coroutine step awaiting `timeout` over a declared input now also declares the input's failures. `@cancjs/toolbox-native` results stay a plain `Promise<T>`.
