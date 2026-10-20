---
"@cancjs/node": patch
---

DNS resolvers now apply the constructor `timeout` and `tries` to every query, not only the first.
