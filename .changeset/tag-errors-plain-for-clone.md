---
"@cancjs/promise": patch
---

Canc error classes now tag as a plain `Error` (`Symbol.toStringTag` is `Error`), so structured clone keeps the kind across a worker thread. Each instance also carries its brand key as a non-enumerable `_cancErrorBrand` string, the one identity that survives the trip. `util.inspect` output and the brand guards are unchanged.
