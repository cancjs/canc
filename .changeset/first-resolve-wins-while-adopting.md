---
"@cancjs/promise": patch
---

Ignore `resolve` and `reject` calls made after resolving with a thenable, as a native promise does.

The promise settles with the outcome of that first thenable, where a later call used to override it, and it stays cancelable until then.
