---
"@cancjs/fetch": patch
---

Cancellation now reaches the response body. Canceling the request after the headers arrived, or canceling a chain step that reads the body, aborts the read and drops the connection. The body readers of the response (`json()`, `text()` and the others) return a `CancelablePromise` and are set as non-enumerable own properties. A caller signal passed through `init`, `AbortSignal.timeout()` included, also keeps covering the body read. Before, both stopped at the headers, so a slow or endless body could not be stopped.
