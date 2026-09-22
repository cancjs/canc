---
'@cancjs/coroutine': minor
---

Refine the return type of cancGenAsync to ICancAsyncGenerator. The returned type extends AsyncGenerator, preserving covariance and backward compatibility with existing AsyncGenerator annotations while retaining internal failure-type branding.
