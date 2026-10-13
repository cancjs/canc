---
"@cancjs/fetch": minor
---

**Breaking:** An annotation `CancelablePromise<Response, TimeoutError>` needs `| Unlisted` added. A value typed `TCancelableFetchFailure` needs narrowing (for example `isTimeoutError`) before reading error properties; `catch` reasons are unaffected. The `cause`, `message`, `name` and `stack` members are no longer part of the type.

Mark the failure of `cancelableFetch` and `cancelableFetchLater` as an open set.

`TCancelableFetchFailure` is now `TimeoutError | Unlisted` instead of `TimeoutError`. A network
failure rejects with the platform error, which the old type did not admit. The rejection handler
receives `any`, so a body such as `.catch((e) => e.code)` compiles as it did on 1.0. A coroutine step
awaiting a fetch still declares `TimeoutError` only. An annotation such as
`CancelablePromise<Response, TimeoutError>` on the result needs `| Unlisted` added.
