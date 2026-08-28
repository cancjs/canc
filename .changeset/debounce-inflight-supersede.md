---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

(toolbox) A superseding debounce or throttle call now cancels an in-flight call too, not only a call still waiting out its timer. A call that already ran on the leading edge is the exception: it keeps running and its caller still receives its result.
