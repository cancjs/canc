## Suite: micro

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · 2026-07-11T09:17:58.214Z

| Case | ops/sec | margin | mean (ms) | samples |
|------|--------:|-------:|----------:|--------:|
| a/construct-resolve native | 9989260 | ±1.79% | 0.0001 | 998927 |
| a/construct-resolve canc | 1522661 | ±1.45% | 0.0007 | 152267 |
| a/construct-resolve bluebird | 634739 | ±14.27% | 0.0016 | 63474 |
| b/chain-1 native | 8032662 | ±1.73% | 0.0001 | 803267 |
| b/chain-1 canc | 889106 | ±1.98% | 0.0011 | 88911 |
| b/chain-1 bluebird | 557108 | ±3.40% | 0.0018 | 55711 |
| b/chain-10 native | 2045904 | ±2.29% | 0.0005 | 205052 |
| b/chain-10 canc | 186996 | ±2.54% | 0.0053 | 18700 |
| b/chain-10 bluebird | 279876 | ±1.58% | 0.0036 | 27988 |
| b/chain-100 native | 317802 | ±1.58% | 0.0031 | 31781 |
| b/chain-100 canc | 32765 | ±2.36% | 0.0305 | 3277 |
| b/chain-100 bluebird | 48919 | ±1.66% | 0.0204 | 4892 |
| c/fanout-100 native | 155647 | ±1.83% | 0.0064 | 15565 |
| c/fanout-100 canc | 11835 | ±2.50% | 0.0845 | 1184 |
| c/fanout-100 bluebird | 48738 | ±2.17% | 0.0205 | 4874 |
| d/all-10 native | 1411186 | ±2.10% | 0.0007 | 141120 |
| d/all-10 canc | 110132 | ±1.88% | 0.0091 | 11014 |
| d/all-10 bluebird | 610919 | ±1.58% | 0.0016 | 61093 |
| d/all-1000 native | 24576 | ±2.31% | 0.0407 | 2458 |
| d/all-1000 canc | 1078 | ±6.21% | 0.9275 | 108 |
| d/all-1000 bluebird | 33538 | ±2.38% | 0.0298 | 3355 |
| d/race-10 native | 494407 | ±1.03% | 0.0020 | 49453 |
| d/race-10 canc | 74789 | ±1.68% | 0.0134 | 7479 |
| d/race-10 bluebird | 441123 | ±1.49% | 0.0023 | 44113 |
| d/race-1000 native | 5052 | ±3.38% | 0.1979 | 506 |
| d/race-1000 canc | 593 | ±6.61% | 1.6849 | 60 |
| d/race-1000 bluebird | 12443 | ±2.60% | 0.0804 | 1245 |
| e/cancel-storm-50 canc | 20910 | ±2.38% | 0.0478 | 2091 |
| e/cancel-storm-50 bluebird | 108998 | ±1.60% | 0.0092 | 10900 |
| h/bubble-leaf-10 canc | 4956 | ±2.73% | 0.2018 | 496 |
| i/allSettled-100 native | 76876 | ±1.58% | 0.0130 | 7688 |
| i/allSettled-100 canc | 7223 | ±2.32% | 0.1384 | 723 |
| i/any-100 native | 60222 | ±1.39% | 0.0166 | 6023 |
| i/any-100 canc | 7518 | ±2.79% | 0.1330 | 752 |
| j/signal-construct native | 8314810 | ±1.84% | 0.0001 | 831481 |
| j/signal-construct canc | 29499 | ±1.41% | 0.0339 | 2950 |
| k/then-settled native | 9951320 | ±4.18% | 0.0001 | 995132 |
| k/then-settled canc | 1397539 | ±4.68% | 0.0007 | 139754 |
| l/handleCancel-register native | 7917322 | ±19.45% | 0.0001 | 791733 |
| l/handleCancel-register canc | 1122697 | ±22.28% | 0.0009 | 112270 |
| f/coroutine-100 native-async | 258948 | ±1.83% | 0.0039 | 25895 |
| f/coroutine-100 canc-cancAsync | 10678 | ±12.48% | 0.0936 | 1068 |

