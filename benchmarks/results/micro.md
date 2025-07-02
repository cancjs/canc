## Suite: micro

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · 2026-07-10T11:18:10.926Z

| Case | ops/sec | margin | mean (ms) | samples |
|------|--------:|-------:|----------:|--------:|
| a/construct-resolve native | 9264981 | ±1.65% | 0.0001 | 926500 |
| a/construct-resolve canc | 543206 | ±2.58% | 0.0018 | 54321 |
| a/construct-resolve bluebird | 567077 | ±4.36% | 0.0018 | 56708 |
| b/chain-1 native | 8316680 | ±1.50% | 0.0001 | 831668 |
| b/chain-1 canc | 373128 | ±1.98% | 0.0027 | 37313 |
| b/chain-1 bluebird | 626622 | ±1.42% | 0.0016 | 62663 |
| b/chain-10 native | 2085208 | ±2.04% | 0.0005 | 208521 |
| b/chain-10 canc | 87600 | ±2.64% | 0.0114 | 8761 |
| b/chain-10 bluebird | 279988 | ±1.92% | 0.0036 | 27999 |
| b/chain-100 native | 314637 | ±2.89% | 0.0032 | 31464 |
| b/chain-100 canc | 11763 | ±2.86% | 0.0850 | 1177 |
| b/chain-100 bluebird | 59196 | ±1.85% | 0.0169 | 5920 |
| c/fanout-100 native | 170248 | ±1.84% | 0.0059 | 17039 |
| c/fanout-100 canc | 5492 | ±2.81% | 0.1821 | 550 |
| c/fanout-100 bluebird | 53174 | ±2.23% | 0.0188 | 5318 |
| d/all-10 native | 1451910 | ±1.60% | 0.0007 | 145191 |
| d/all-10 canc | 54188 | ±2.47% | 0.0185 | 5419 |
| d/all-10 bluebird | 512070 | ±1.61% | 0.0020 | 51207 |
| d/all-1000 native | 23206 | ±2.57% | 0.0431 | 2321 |
| d/all-1000 canc | 532 | ±7.60% | 1.8806 | 54 |
| d/all-1000 bluebird | 33326 | ±2.17% | 0.0300 | 3333 |
| d/race-10 native | 475225 | ±1.45% | 0.0021 | 47523 |
| d/race-10 canc | 32680 | ±2.12% | 0.0306 | 3268 |
| d/race-10 bluebird | 378990 | ±1.33% | 0.0026 | 37899 |
| d/race-1000 native | 5578 | ±3.97% | 0.1793 | 558 |
| d/race-1000 canc | 316 | ±8.46% | 3.1615 | 32 |
| d/race-1000 bluebird | 11808 | ±2.77% | 0.0847 | 1181 |
| e/cancel-storm-50 canc | 3123 | ±3.85% | 0.3202 | 313 |
| e/cancel-storm-50 bluebird | 102277 | ±2.16% | 0.0098 | 10228 |
| f/coroutine-100 native-async | 224573 | ±2.40% | 0.0045 | 22458 |
| f/coroutine-100 canc-cancAsync | 3990 | ±6.25% | 0.2506 | 399 |

