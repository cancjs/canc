---
"@cancjs/fetch": minor
---

**Breaking:** An annotation `CancelablePromise<Response, TimeoutError>` or `CancelablePromise<Response, TypeError>` on the result needs `| Unlisted` added, and a value typed `TCancelableFetchFailure` needs narrowing before reading error properties. A `catch` reason is still `any` and is unaffected.

The declared failure of `cancelableFetch` and `cancelableFetchLater` is now the network `TypeError` (typed with `name: 'TypeError'`) or `Unlisted` instead of `TimeoutError | Unlisted`. A network, URL or CORS failure rejects with the `TypeError` of `fetch`, while a timeout never arrived raw: it rejects with a `CancelError` whose `timedOut` is true. The set stays open, so a `catch` reason is still `any`. A coroutine step over a fetch now contributes `TypeError`. This replaces the `TimeoutError`-based declaration described in the earlier open-failure note.
