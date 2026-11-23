---
'@cancjs/promise': patch
---

Keep a race loser alive when the race result resumes a native await continuation and that continuation immediately awaits the loser, including already-settled winners.
