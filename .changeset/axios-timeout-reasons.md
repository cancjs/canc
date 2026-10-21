---
"@cancjs/axios": patch
---

Mark caller timeouts as timeouts, keep canceling the remaining linked promises when one cancel throws, and keep the cancel context after an interceptor that unwraps the response.
