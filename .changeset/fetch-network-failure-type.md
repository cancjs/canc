---
"@cancjs/fetch": minor
---

The declared failure of `cancelableFetch` and `cancelableFetchLater` is now `TypeError | Unlisted` instead of `TimeoutError | Unlisted`. A network, URL or CORS failure rejects with the `TypeError` of `fetch`, while a timeout never arrived raw: it rejects with a `CancelError` whose `timedOut` is true. The set stays open, so a `catch` reason is still `any`. A coroutine step over a fetch now contributes `TypeError`.

`TypeError` declares no member beyond `Error`, so a coroutine that awaits a fetch next to other declared `Error` subclasses infers `TypeError` as its failure.
