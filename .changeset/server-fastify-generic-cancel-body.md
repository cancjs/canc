---
'@cancjs/server-fastify': minor
---

**Breaking:** With `cancelPlugin` registered, fastify's default error body for a cancellation this package raised (a deadline, a shutdown) now carries the status text, such as `Service Unavailable`, as its `message` instead of the cancellation's own message. A custom shutdown `reason` or deadline `message` no longer reaches clients through that body. The error keeps its message, so logs and your own error handler still see it, and a body your error handler writes is not changed.
