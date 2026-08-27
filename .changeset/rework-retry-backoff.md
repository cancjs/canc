---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

(toolbox) Replace retry's `minTimeout`/`maxTimeout` with `initialDelay`/`maxDelay`, defaulting to a real exponential backoff instead of zero delay. The old names still work as deprecated aliases (`minTimeout` falls back for `initialDelay`, `maxTimeout` for `maxDelay`) and will be removed in the next major; an unsupplied alias still means the new 300/30000 defaults, not the old zero-backoff default.
(toolbox) Change `retries` to count attempts after the first call instead of total attempts.
(toolbox) Add `factor`, `jitter`, `shouldRetry` and a `delay` override to retry, and pass the actual wait to `onRetry`.
