---
"@cancjs/unhandled-rejection": minor
---

**Breaking:** The browser `register` script no longer carries its own copy of the package. Load `@cancjs/promise`, then the `index` script of this package, then the `register` script; a `register` script loaded alone now throws on load.
