## Suite: micro-alloc (10k promises)

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · 2026-07-11T03:36:31.376Z

| Impl | count | heap delta (KB) | bytes/promise | GC during alloc |
|------|------:|----------------:|--------------:|----------------:|
| native | 10000 | 556.5 | 57 | 0 |
| canc | 10000 | 14433.1 | 1478 | 0 |
| bluebird | 10000 | 1378.4 | 141 | 0 |

