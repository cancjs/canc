---
"@cancjs/unhandled-rejection": patch
---

Leave other `unhandledRejection` listeners in charge on Node.

The default handling no longer throws from inside the listener. When another listener exists it decides the outcome, so an error SDK registered after `register()` receives real errors. Otherwise the reason is rethrown on a later turn, so several rejections in one tick each reach an `uncaughtException` handler. `--unhandled-rejections` is read from the command line and `NODE_OPTIONS`: `warn` and `none` log and never throw, and `strict` prints one warning that suppression is inert.
