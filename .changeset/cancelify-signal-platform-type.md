---
"@cancjs/toolbox": minor
---

**Breaking:** In a `cancelify` function, reading a property off `ctx.signal` that `AbortSignal` does not have no longer compiles; the signal was typed `any`.

The `cancelify` context's `signal` and `getSignal()` are now typed as the platform `AbortSignal`, with the same fallback as the core executor context.
