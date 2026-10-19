---
"@cancjs/unhandled-rejection": minor
---

Share one registration list per process across the side-effect import, `register()` and both module formats. Importing `@cancjs/unhandled-rejection/register` and then calling `register({ onUnhandledRejection })` no longer installs two listeners that ignore the callback, and `unregister()` removes the handler the side-effect import installed. Calling `register()` again for the same target now replaces the earlier handler and options and logs a warning, instead of keeping the old options.
