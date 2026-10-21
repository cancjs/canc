---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

Fix `throttle` invoking about every two intervals under steady calls: it now invokes once per interval, measured from the last invocation, so steady calls invoke the wrapped function about twice as often as before. `flush()` no longer reopens the throttle window or invokes twice, and does nothing with `trailing: false`. `debounce` and `throttle` forward `this` to the wrapped function, give a call made from inside the function its own result, and drop the retained arguments after a skipped trailing call.
