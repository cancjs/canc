---
"@cancjs/toolbox": minor
---

Use the `ISettledResult` type from `@cancjs/promise` for the `cancel` result of prebound helpers.

The emitted declarations no longer name the lib `PromiseSettledResult` there. The shape is
unchanged. This needs `@cancjs/promise` 1.1.0 or newer, which the peer range already requires.
