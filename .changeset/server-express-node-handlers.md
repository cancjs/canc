---
"@cancjs/server-express": patch
"@cancjs/server-node": patch
---

Cancel answers from the express and node handlers keep the framework headers. A deadline or a shutdown answer sends the `headers` it was given, such as `Retry-After`, when its status came from the error, and drops the `Content-Type`, `Content-Encoding`, `Content-Language` and `Content-Range` the route set. A cancellation that reaches express after the head was sent ends the socket. A late failure after a deadline is logged once through `console.error`, outside the express test environment.
