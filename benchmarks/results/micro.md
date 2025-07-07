## Suite: micro

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · 2026-07-11T05:57:12.316Z

| Case | ops/sec | margin | mean (ms) | samples |
|------|--------:|-------:|----------:|--------:|
| a/construct-resolve native | 11295259 | ±4.27% | 0.0001 | 1129527 |
| a/construct-resolve canc | 1583068 | ±1.94% | 0.0006 | 158307 |
| a/construct-resolve bluebird | 720172 | ±13.34% | 0.0014 | 72018 |
| b/chain-1 native | 9915410 | ±1.57% | 0.0001 | 991541 |
| b/chain-1 canc | 1031322 | ±1.74% | 0.0010 | 103133 |
| b/chain-1 bluebird | 725047 | ±1.44% | 0.0014 | 72505 |
| b/chain-10 native | 2520215 | ±1.38% | 0.0004 | 252022 |
| b/chain-10 canc | 246073 | ±1.88% | 0.0041 | 24608 |
| b/chain-10 bluebird | 346022 | ±1.92% | 0.0029 | 34603 |
| b/chain-100 native | 338930 | ±1.60% | 0.0030 | 33894 |
| b/chain-100 canc | 30935 | ±1.97% | 0.0323 | 3094 |
| b/chain-100 bluebird | 70752 | ±1.68% | 0.0141 | 7076 |
| c/fanout-100 native | 148700 | ±2.24% | 0.0067 | 14870 |
| c/fanout-100 canc | 10826 | ±2.30% | 0.0924 | 1083 |
| c/fanout-100 bluebird | 58664 | ±1.87% | 0.0170 | 5867 |
| d/all-10 native | 1534162 | ±1.41% | 0.0007 | 153417 |
| d/all-10 canc | 112407 | ±1.71% | 0.0089 | 11241 |
| d/all-10 bluebird | 607123 | ±1.32% | 0.0016 | 60713 |
| d/all-1000 native | 28674 | ±2.20% | 0.0349 | 2868 |
| d/all-1000 canc | 1136 | ±6.62% | 0.8799 | 114 |
| d/all-1000 bluebird | 34000 | ±1.55% | 0.0294 | 3400 |
| d/race-10 native | 615712 | ±0.96% | 0.0016 | 61572 |
| d/race-10 canc | 71117 | ±1.56% | 0.0141 | 7112 |
| d/race-10 bluebird | 418989 | ±1.27% | 0.0024 | 41899 |
| d/race-1000 native | 6401 | ±2.06% | 0.1562 | 641 |
| d/race-1000 canc | 716 | ±6.03% | 1.3958 | 73 |
| d/race-1000 bluebird | 14800 | ±1.77% | 0.0676 | 1480 |
| e/cancel-storm-50 canc | 6815 | ±2.17% | 0.1467 | 682 |
| e/cancel-storm-50 bluebird | 123132 | ±1.52% | 0.0081 | 12314 |
| h/bubble-leaf-10 canc | 4555 | ±1.99% | 0.2195 | 456 |
| i/allSettled-100 native | 91940 | ±1.29% | 0.0109 | 9194 |
| i/allSettled-100 canc | 7040 | ±1.90% | 0.1420 | 705 |
| i/any-100 native | 54674 | ±1.29% | 0.0183 | 5468 |
| i/any-100 canc | 6308 | ±3.16% | 0.1585 | 631 |
| j/signal-construct native | 10203340 | ±2.06% | 0.0001 | 1020335 |
| j/signal-construct canc | 24935 | ±23.10% | 0.0401 | 2494 |
| k/then-settled native | 8789291 | ±17.73% | 0.0001 | 878930 |
| k/then-settled canc | 1301935 | ±18.83% | 0.0008 | 130194 |
| l/handleCancel-register native | 10366310 | ±1.26% | 0.0001 | 1036632 |
| l/handleCancel-register canc | 1405616 | ±1.50% | 0.0007 | 140562 |
| f/coroutine-100 native-async | 298885 | ±1.78% | 0.0033 | 29889 |
| f/coroutine-100 canc-cancAsync | 9977 | ±9.72% | 0.1002 | 998 |

