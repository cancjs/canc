## Suite: micro-alloc (10k promises)

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · 2026-07-11T14:49:13.497Z

| Impl | count | heap delta (KB) | bytes/promise | GC during alloc |
|------|------:|----------------:|--------------:|----------------:|
| native | 10000 | 556.5 | 57 | 0 |
| canc | 10000 | 3734.5 | 382 | 0 |
| bluebird | 10000 | 1185.6 | 121 | 0 |

