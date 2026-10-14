---
"@cancjs/promise": patch
---

A bubble now lands after the current synchronous turn. When the last consumer of a promise is canceled, the parent is canceled two microtasks later, after its consumers are counted again, instead of inside the `cancel()` call. A consumer subscribed anywhere in that turn keeps the parent alive, including a native `await`, `Promise.resolve()` or `Promise.all()` that subscribes one job late. Before, canceling a derived promise canceled the parent under a live `await` written in the same turn, and that `await` rejected with a `CancelError`. Above the first parent the cascade still runs synchronously, a direct `cancel()` and propagation down the chain stay synchronous, and `await child.cancel()` still waits for the parent's cleanup. In `asyncCancel: false` mode the parent cleanup runs two microtasks after `cancel()` returns.
