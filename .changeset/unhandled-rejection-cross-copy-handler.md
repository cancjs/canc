---
"@cancjs/unhandled-rejection": minor
---

Several copies of the package in one Node, Bun or Electron main process now keep a single handler: `register()` replaces the handler another copy installed, `unregister()` removes it, and a real rejection is no longer swallowed silently when only copies of this package are listening. Browsers, Deno, workers and edge runtimes cannot list their listeners, so each copy there keeps its own handler.
