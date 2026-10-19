---
'@cancjs/node': patch
---

Fix `dgram`: `send` sizes a string by its UTF-8 bytes, a failed `connect` rejects with node's error instead of resolving, `bind` and `connect` no longer leave an `error` listener behind, and `createSocket` is typed with `RemoteInfo` and `SocketOptions` instead of `any`. Canceling `send` stops waiting for the result but does not recall a datagram already handed to the socket.
