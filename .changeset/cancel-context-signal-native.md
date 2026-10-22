---
"@cancjs/toolbox-native": minor
---

The `getSignal` function `promisify` passes to its `transformArgs` and `handleCancel` hooks carries a `signal` property returning the same signal, so `(args, { signal }) => ...` works there. It is a non-enumerable getter and creates the `AbortController` only when read. The property is set up only for a hook that declares that parameter or whose source mentions `signal`, `arguments` or a rest parameter, a best-effort check run once per `promisify()` call; a hook reading it under a computed name, or a bound or native hook, should call `getSignal()`.
