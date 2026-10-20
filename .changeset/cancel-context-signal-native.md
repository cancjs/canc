---
"@cancjs/toolbox-native": minor
---

The `getSignal` function `promisify` passes to its `transformArgs` and `handleCancel` hooks carries a `signal` property returning the same signal, so `(args, { signal }) => ...` works there. It is a non-enumerable getter and creates the `AbortController` only when read.
