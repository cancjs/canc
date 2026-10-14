---
'@cancjs/node': patch
---

Export `duplexPair` on all supported Node versions, throwing `NotImplementedError` on runtimes prior to Node 20.17.0 and 22.6.0.
