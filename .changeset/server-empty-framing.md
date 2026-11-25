---
"@cancjs/server-node": patch
"@cancjs/server-express": patch
"@cancjs/server-hono": patch
---

Ensure cancellation and fallback responses with no body finish without stale Content-Length, and reject invalid timeout headers at configuration rather than during response processing.
