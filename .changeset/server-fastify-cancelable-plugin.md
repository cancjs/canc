---
'@cancjs/server-fastify': minor
---

Add `cancelablePlugin(plugin, options?)`, which runs a plugin's startup under a cancel scope. A generator plugin stops at its next `yield` and runs its `finally` blocks, so a database or broker connection is not left half open, when it runs longer than its `timeout` (by default just under fastify's `pluginTimeout`, which otherwise only stops waiting while the plugin keeps running), when a given `signal` aborts, or when the `shutdown()` from `createShutdown` starts during startup. That shutdown no longer waits for the startup to finish. A plain `app.close()` during startup still waits, as fastify waits for startup before closing. A startup stopped by its `timeout` fails with a `CancelError` that carries fastify's `FST_ERR_PLUGIN_TIMEOUT` code, so existing `err.code` checks keep working.
