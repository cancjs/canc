---
"@cancjs/coroutine": patch
---

A coroutine called with an already aborted `signal` no longer runs its body. Before, the promise was canceled at once but the generator still ran every step to the end. With `strict`, such a call now returns a rejected promise instead of throwing. A cancel accepted while the body is running now always settles the promise returned by `cancel()`, even when the body throws right after it. Cancel handlers of a coroutine now receive the reason passed to `cancel()` instead of the `CancelError`, the same as for any other promise. The coroutine still stays pending, with `canceled` false, until its `finally` blocks finish.
