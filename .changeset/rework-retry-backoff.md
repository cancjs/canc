---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

(toolbox) Replace retry's `minTimeout`/`maxTimeout` with `initialDelay`/`maxDelay`, defaulting to a real exponential backoff instead of zero delay.
(toolbox) Change `retries` to count attempts after the first call instead of total attempts.
(toolbox) Add `factor`, `jitter`, `shouldRetry` and a `delay` override to retry, and pass the actual wait to `onRetry`.
