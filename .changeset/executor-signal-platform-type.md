---
"@cancjs/promise": minor
---

**Breaking:** A hand-written mock or implementation of `IExecutorContext` must return a real `AbortSignal` from `signal` and `getSignal()`, such as `new AbortController().signal`.

The executor context's `signal` and `getSignal()` are now typed as the `AbortSignal` of the TypeScript lib in use, DOM or Node types, so `fetch(url, { signal })` compiles. Without such a lib the type falls back to the minimal `IAbortSignal` shape. Both names are exported: `TAbortSignal` for the signal the context hands out, `IAbortSignal` for the shape the `signal` option accepts.
