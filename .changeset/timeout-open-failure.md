---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

**Breaking:** An annotation `CancelablePromise<T, TimeoutError>` on the result of `timeout` or `waitFor` needs `| Unlisted` added.

Mark the failure of `timeout` and `waitFor` as an open set.

`timeout` and `waitFor` now declare `TimeoutError | Unlisted` instead of `TimeoutError`. Their
rejection handler receives `any`, so a body such as `.catch((e) => e.response)` compiles as it did
on 1.0. The declared `TimeoutError` stays visible in the type, and `catchErrors(p, TimeoutError)`
leaves `Unlisted`. Helpers that pass their input through, such as `delay` and `minDelay`, keep a
declared failure closed. A coroutine step awaiting `timeout` still declares `TimeoutError` only.
An annotation such as `CancelablePromise<T, TimeoutError>` on the result needs `| Unlisted` added.
