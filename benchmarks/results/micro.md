## Suite: micro

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · 2026-07-11T05:21:30.299Z

| Case | ops/sec | margin | mean (ms) | samples |
|------|--------:|-------:|----------:|--------:|
| a/construct-resolve native | 10023240 | ±6.14% | 0.0001 | 1002324 |
| a/construct-resolve canc | 743193 | ±1.54% | 0.0013 | 74320 |
| a/construct-resolve bluebird | 701243 | ±1.66% | 0.0014 | 70125 |
| b/chain-1 native | 9562940 | ±1.69% | 0.0001 | 956295 |
| b/chain-1 canc | 409271 | ±11.54% | 0.0024 | 40946 |
| b/chain-1 bluebird | 628396 | ±11.05% | 0.0016 | 62840 |
| b/chain-10 native | 2340921 | ±1.59% | 0.0004 | 234093 |
| b/chain-10 canc | 118896 | ±1.88% | 0.0084 | 11890 |
| b/chain-10 bluebird | 337186 | ±0.97% | 0.0030 | 33719 |
| b/chain-100 native | 360332 | ±1.42% | 0.0028 | 36034 |
| b/chain-100 canc | 14538 | ±1.80% | 0.0688 | 1454 |
| b/chain-100 bluebird | 78789 | ±1.15% | 0.0127 | 7879 |
| c/fanout-100 native | 196957 | ±1.90% | 0.0051 | 19696 |
| c/fanout-100 canc | 5840 | ±1.84% | 0.1712 | 584 |
| c/fanout-100 bluebird | 58076 | ±1.75% | 0.0172 | 5808 |
| d/all-10 native | 1611210 | ±1.41% | 0.0006 | 161122 |
| d/all-10 canc | 54212 | ±7.10% | 0.0184 | 5422 |
| d/all-10 bluebird | 641675 | ±2.00% | 0.0016 | 64168 |
| d/all-1000 native | 26717 | ±2.50% | 0.0374 | 2672 |
| d/all-1000 canc | 669 | ±5.24% | 1.4958 | 67 |
| d/all-1000 bluebird | 31371 | ±1.97% | 0.0319 | 3138 |
| d/race-10 native | 572329 | ±1.28% | 0.0017 | 57233 |
| d/race-10 canc | 36768 | ±2.14% | 0.0272 | 3677 |
| d/race-10 bluebird | 422169 | ±1.64% | 0.0024 | 42217 |
| d/race-1000 native | 6052 | ±2.80% | 0.1652 | 606 |
| d/race-1000 canc | 360 | ±5.63% | 2.7784 | 36 |
| d/race-1000 bluebird | 14076 | ±2.26% | 0.0710 | 1408 |
| e/cancel-storm-50 canc | 3633 | ±3.17% | 0.2752 | 364 |
| e/cancel-storm-50 bluebird | 102922 | ±1.23% | 0.0097 | 10293 |
| h/bubble-leaf-10 canc | 4269 | ±2.25% | 0.2343 | 427 |
| i/allSettled-100 native | 96614 | ±1.36% | 0.0104 | 9662 |
| i/allSettled-100 canc | 4253 | ±2.21% | 0.2351 | 426 |
| i/any-100 native | 51675 | ±1.51% | 0.0194 | 5168 |
| i/any-100 canc | 3779 | ±3.40% | 0.2646 | 379 |
| j/signal-construct native | 9208361 | ±1.18% | 0.0001 | 920837 |
| j/signal-construct canc | 23113 | ±1.84% | 0.0433 | 2312 |
| k/then-settled native | 9891560 | ±3.37% | 0.0001 | 989156 |
| k/then-settled canc | 574994 | ±1.31% | 0.0017 | 57500 |
| l/handleCancel-register native | 9264461 | ±1.11% | 0.0001 | 926447 |
| l/handleCancel-register canc | 568447 | ±1.79% | 0.0018 | 56846 |
| f/coroutine-100 native-async | 252034 | ±2.39% | 0.0040 | 25204 |
| f/coroutine-100 canc-cancAsync | 4199 | ±21.89% | 0.2382 | 420 |

