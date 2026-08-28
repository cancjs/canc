---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

(toolbox) A superseding debounce or throttle call now cancels an in-flight call too, not only a call still waiting out its timer. A call that already ran on the leading edge is the exception: it keeps running and its caller still receives its result. On the native (non-cancelable) twin, where there is nothing to cancel, a superseded call instead rejects with the new `SupersededError`, checkable with `isSupersededError`, so it can be told apart from a real failure. A fire-and-forget `debounced(x)` or `throttled(x)` call now needs its own rejection handler, or a superseding call raises an unhandled rejection.
