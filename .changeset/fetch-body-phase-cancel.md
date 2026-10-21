---
"@cancjs/fetch": minor
---

**Breaking:** Calling `cancel()` on a promise that already settled now aborts a response body that is still streaming, so a read that used to continue after that call is stopped.

Cancellation now reaches the response body. Canceling the request after the headers arrived, or canceling a chain step that reads the body, aborts the read and drops the connection. The body readers of the response (`json()`, `text()` and the others) return a `CancelablePromise` and are set as non-enumerable own properties. A caller signal passed through `init`, `AbortSignal.timeout()` included, also keeps covering the body read. Before, both stopped at the headers, so a slow or endless body could not be stopped.
