---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

**Breaking:** An annotation `CancelablePromise<T, never>` on `delay`, `minDelay` or `retry` over a native or foreign promise, or on a `promisify` result, needs `Unlisted` in place of `never`.

`delay(input, ms)`, `minDelay` and `retry` now declare an open failure set, `Unlisted`, when the work is a native or foreign promise or a function returning one, and `promisify` does for every call, since a callback can fail with any error. A cancelable promise input keeps its declared set and a plain value still declares `never`. In `@cancjs/toolbox-native` only the overload list changes, since its promises carry no failure type.
