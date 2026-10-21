---
"@cancjs/fetch": patch
"@cancjs/node": patch
---

This package bundles part of the shared toolbox code, so it is rebuilt with the updated sources. No behavior change is expected. `@cancjs/node` bundles `retry`, which now releases a shared cancelable attempt instead of canceling it.
