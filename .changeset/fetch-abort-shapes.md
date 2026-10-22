---
"@cancjs/fetch": minor
---

**Breaking:** A raw `TimeoutError` from `fetch` now rejects as a `CancelError` whose `timedOut` is true, so code that tests a caught reason with `isTimeoutError` must test `isCancelError` and read `timedOut` instead.

Every abort now rejects with a `CancelError`, whatever `fetch` implementation is used. Implementations such as node-fetch 2 or whatwg-fetch reject with their own `AbortError` and ignore the signal reason. The error is now built from the reason the request was aborted with, so `cause` is the caller's reason and `timedOut` is true for a timeout. A rejection named `AbortError` or `TimeoutError`, or a `DOMException` with the legacy abort or timeout code, also becomes a `CancelError`. An injected `AbortController` now receives the abort reason, and `cancel(reason)` passes the reason on to the signal given to `fetch`.
