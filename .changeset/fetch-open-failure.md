---
"@cancjs/fetch": minor
---

Mark the failure of `cancelableFetch` and `cancelableFetchLater` as an open set.

`TCancelableFetchFailure` is now `TimeoutError | Unlisted` instead of `TimeoutError`. A network
failure rejects with the platform error, which the old type did not admit. The rejection handler
receives `any`, so a body such as `.catch((e) => e.code)` compiles as it did on 1.0. A coroutine step
awaiting a fetch still declares `TimeoutError` only. An annotation such as
`CancelablePromise<Response, TimeoutError>` on the result needs `| Unlisted` added.
