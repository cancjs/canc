---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

Invoke `throttle` and a leading `debounce` on the leading edge of every window, instead of only on the first call of a wrapper's lifetime.

`throttle` now keeps a minimum gap between invocations. A trailing invocation re-arms the window, so a continuously driven throttle no longer fires twice across a window boundary, once on the trailing edge and again as the next call's leading edge. The re-arm applies only to the throttle shape, where the maximum wait equals the interval. A `debounce` with a different `maxWait` keeps its old timing and reports no pending work once its trailing call has run. `flush()` now returns `undefined` when no call is waiting, rather than the promise of a call that already completed.
