---
"@cancjs/axios": minor
---

Narrow the wrap options so the lazy option is a type error, and document that canceling an aggregate keeps requests that have other consumers.

The wrap options type no longer accepts `lazy`. The option never had an effect: a request was always sent eagerly, whatever `lazy` was set to.
