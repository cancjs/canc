---
'@cancjs/server-node': patch
---

When a custom `onError` throws before ending the response, the socket is now destroyed instead of left open, so a request whose deadline fired no longer waits until the client or a socket timeout gives up. The thrown error still surfaces as before.
