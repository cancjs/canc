---
"@cancjs/promise": patch
---

A promise that fulfills or rejects now drops its cancel handlers, since it can no longer be canceled. Before, every settled link of a `then` chain kept a reference to its parent through the handler that bubbles a cancel up, so a long-lived chain such as `queue = queue.then(next)` kept every earlier link in memory for as long as the last one was alive. The cleanup list of a canceled promise is also released once its cleanup has settled; calling `cancel()` again after that resolves with an empty list.

Bubbling a cancel up a deep chain no longer overflows the stack. The cascade above the first parent runs in a loop instead of recursing, so canceling the last link of a chain thousands of links deep now cancels the root, in the same order as before: a parent's handlers still run before the rest of the handlers of the child that bubbled into it.
