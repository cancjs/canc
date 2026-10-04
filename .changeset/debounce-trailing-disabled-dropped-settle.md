---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

Settle a dropped call when trailing is disabled. A call dropped by `trailing: false` now rejects with a `SupersededError` (or is canceled, if using a cancelable promise implementation) instead of remaining pending forever. A fire-and-forget call made during a quiet period under `trailing: false` now requires a rejection handler.

Keep a completed trailing call when a later call supersedes. A trailing call that has already fired is no longer erroneously canceled if a new call starts a new debounce window while the old call is still pending.
Keep a completed trailing call when a later call supersedes. Stop the debounce timer instead of dropping its handle.
