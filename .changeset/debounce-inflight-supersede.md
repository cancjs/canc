---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

A superseding debounce or throttle call now cancels a call that has not completed, whether it is still waiting out its timer or has already run `fn` and is waiting on the result. A call that has completed is kept and its caller still receives its result, as is a call that ran on the leading edge. On the native (non-cancelable) twin there is nothing to cancel once `fn` has run, so only a call still waiting out its timer is stopped, and it rejects with the new `SupersededError`, checkable with `isSupersededError`, so it can be told apart from a real failure. On both twins a superseded call counts as handled, so a fire-and-forget `debounced(x)` or `throttled(x)` raises no unhandled rejection for it, while a failure of `fn` itself still surfaces.
