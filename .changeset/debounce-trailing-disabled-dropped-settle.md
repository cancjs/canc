---
"@cancjs/toolbox": minor
"@cancjs/toolbox-native": minor
---

Settle a dropped call when trailing is disabled. A call dropped by `trailing: false` now rejects with a `SupersededError` (or is canceled under a cancelable promise implementation) instead of remaining pending forever.

A trailing call that has already fired is no longer canceled if a new call arrives while the previous call is settling.
