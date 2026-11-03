---
"@cancjs/server-fastify": minor
---

**Breaking:** A request that arrives on a kept-alive connection during the shutdown is now answered by fastify, with 503 unless `return503OnClosing` is false, instead of being served. Set `return503OnClosing: false` to keep serving such requests.

`cancelPlugin` now drains the server inside fastify's own close, so a plain `await app.close()` lets in-flight requests finish with `Connection: close` and cancels the ones still running at `cancelAfter`, instead of resetting them or waiting on idle kept-alive connections. `createShutdown(app, options)` takes the options that close uses, and its `shutdown()` runs `app.close()`. Created after `app.listen()` without the plugin, it drains first and closes after, as before.

Fastify cuts the close off at `pluginTimeout` (10 s by default), which the default windows would pass, so inside fastify's close the shutdown lowers `cancelAfter` and `closeAfter` to end just under it and logs that once through `app.log.warn`. Raise `pluginTimeout` to keep longer windows.
