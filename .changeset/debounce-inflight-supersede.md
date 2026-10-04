---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

(toolbox) A superseding debounce or throttle call now cancels a call that has not completed, whether it is still waiting out its timer or has already run `fn` and is waiting on the result. A call that has completed is kept and its caller still receives its result, as is a call that ran on the leading edge. On the native (non-cancelable) twin there is nothing to cancel once `fn` has run, so only a call still waiting out its timer is stopped, and it rejects with the new `SupersededError`, checkable with `isSupersededError`, so it can be told apart from a real failure. On that twin a fire-and-forget `debounced(x)` or `throttled(x)` call now needs its own rejection handler, or a superseding call raises an unhandled rejection; on the cancelable twin a cancellation counts as handled, so no handler is required.
