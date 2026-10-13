---
"@cancjs/axios": patch
"@cancjs/coroutine": patch
"@cancjs/decorators": patch
"@cancjs/fetch": patch
"@cancjs/toolbox": patch
"@cancjs/unhandled-rejection": patch
---

Fix the browser (UMD) builds failing on load when a canc peer is required. They now look up `canc_promise`, `canc_coroutine` and `canc_toolbox` instead of a guessed global.
