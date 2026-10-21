---
"@cancjs/toolbox": minor
---

The `cancelify` context gains a `signal` property, so a wrapped function can take the outbound signal by destructuring: `cancelify(({ signal }, id) => api.get(id, { signal }))`. It returns the same signal as `getSignal()` and creates the `AbortController` only when read. It is an inherited non-enumerable getter, so spread and `JSON.stringify` neither copy it nor create the controller. `getSignal` on the context is deprecated in favor of `signal`. The `getSignal` function `promisify` passes to its `transformArgs` and `handleCancel` hooks also carries `signal`, so `(args, { signal }) => ...` works there; that positional form stays supported. The property is set up only for a hook that declares that parameter or whose source mentions `signal`, `arguments` or a rest parameter, a best-effort check run once per `promisify()` call; a hook reading it under a computed name, or a bound or native hook, should call `getSignal()`.
