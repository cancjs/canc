## Suite: micro

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · 2026-07-16T15:14:48.939Z

| Case | ops/sec | margin | mean (ms) | samples |
|------|--------:|-------:|----------:|--------:|
| a/construct-resolve native | 9283401 | ±3.23% | 0.0001 | 928342 |
| a/construct-resolve canc | 934626 | ±14.95% | 0.0011 | 93463 |
| a/construct-resolve bluebird | 600786 | ±10.76% | 0.0017 | 60079 |
| b/chain-1 native | 8334450 | ±2.39% | 0.0001 | 833445 |
| b/chain-1 canc | 685678 | ±29.64% | 0.0015 | 68622 |
| b/chain-1 bluebird | 571274 | ±3.34% | 0.0018 | 57128 |
| b/chain-10 native | 1996316 | ±2.98% | 0.0005 | 199632 |
| b/chain-10 canc | 211880 | ±2.67% | 0.0047 | 21188 |
| b/chain-10 bluebird | 283575 | ±3.44% | 0.0035 | 28358 |
| b/chain-100 native | 286624 | ±3.47% | 0.0035 | 28663 |
| b/chain-100 canc | 25771 | ±4.78% | 0.0388 | 2586 |
| b/chain-100 bluebird | 56964 | ±3.24% | 0.0176 | 5697 |
| c/fanout-100 native | 159284 | ±2.93% | 0.0063 | 15929 |
| c/fanout-100 canc | 8649 | ±4.40% | 0.1156 | 865 |
| c/fanout-100 bluebird | 45637 | ±3.84% | 0.0219 | 4565 |
| d/all-10 native | 1190543 | ±3.69% | 0.0008 | 119055 |
| d/all-10 canc | 73366 | ±5.70% | 0.0136 | 7337 |
| d/all-10 bluebird | 405823 | ±7.29% | 0.0025 | 40583 |
| d/all-1000 native | 23604 | ±3.70% | 0.0424 | 2361 |
| d/all-1000 canc | 865 | ±12.40% | 1.1557 | 87 |
| d/all-1000 bluebird | 27206 | ±2.94% | 0.0368 | 2721 |
| d/race-10 native | 452973 | ±3.36% | 0.0022 | 45298 |
| d/race-10 canc | 70873 | ±4.00% | 0.0141 | 7088 |
| d/race-10 bluebird | 320060 | ±5.83% | 0.0031 | 32007 |
| d/race-1000 native | 5089 | ±7.37% | 0.1965 | 514 |
| d/race-1000 canc | 726 | ±14.18% | 1.3782 | 73 |
| d/race-1000 bluebird | 7735 | ±7.53% | 0.1293 | 774 |
| e/cancel-storm-50 canc | 13005 | ±7.78% | 0.0769 | 1301 |
| e/cancel-storm-50 bluebird | 95177 | ±4.38% | 0.0105 | 9518 |
| h/bubble-leaf-10 canc | 3677 | ±5.44% | 0.2720 | 368 |
| i/allSettled-100 native | 69778 | ±2.22% | 0.0143 | 6978 |
| i/allSettled-100 canc | 5577 | ±6.83% | 0.1793 | 558 |
| i/any-100 native | 47089 | ±3.76% | 0.0212 | 4709 |
| i/any-100 canc | 7433 | ±7.47% | 0.1345 | 744 |
| j/signal-construct native | 6587380 | ±5.09% | 0.0002 | 658738 |
| j/signal-construct canc | 23938 | ±23.10% | 0.0418 | 2394 |
| k/then-settled native | 8810640 | ±5.51% | 0.0001 | 881064 |
| k/then-settled canc | 1114779 | ±2.51% | 0.0009 | 111478 |
| l/handleCancel-register native | 9109740 | ±2.94% | 0.0001 | 910974 |
| l/handleCancel-register canc | 874720 | ±4.41% | 0.0011 | 87472 |
| f/coroutine-100 native-async | 220306 | ±4.87% | 0.0045 | 22031 |
| f/coroutine-100 canc-cancAsync | 7664 | ±14.03% | 0.1305 | 767 |

