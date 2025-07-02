## Browser lane (P3-4)

| Browser | Suite | Case | ops/sec | margin | mean (ms) | samples |
|---------|-------|------|--------:|-------:|----------:|--------:|
| chromium 149.0.7827.55 | a-construct-resolve | native-construct-resolve | 5587370 | ±6.30% | 0.0002 | 558737 |
| chromium 149.0.7827.55 | a-construct-resolve | canc-construct-resolve | 690180 | ±8.65% | 0.0014 | 69018 |
| chromium 149.0.7827.55 | b-then-chain | native-then-chain-10 | 2322520 | ±6.22% | 0.0004 | 232252 |
| chromium 149.0.7827.55 | b-then-chain | canc-then-chain-10 | 125550 | ±6.00% | 0.0080 | 12555 |
| chromium 149.0.7827.55 | c-fanout | native-fanout-100 | 230729 | ±6.10% | 0.0043 | 23096 |
| chromium 149.0.7827.55 | c-fanout | canc-fanout-100 | 6088 | ±3.94% | 0.1643 | 610 |
| chromium 149.0.7827.55 | d-all-race-width | native-all-width-10 | 1721109 | ±6.23% | 0.0006 | 172283 |
| chromium 149.0.7827.55 | d-all-race-width | canc-all-width-10 | 74880 | ±5.89% | 0.0134 | 7488 |
| chromium 149.0.7827.55 | d-all-race-width | native-all-width-1000 | 36750 | ±5.46% | 0.0272 | 3675 |
| chromium 149.0.7827.55 | d-all-race-width | canc-all-width-1000 | 815 | ±5.57% | 1.2268 | 82 |
| chromium 149.0.7827.55 | d-all-race-width | native-race-width-10 | 1266570 | ±6.21% | 0.0008 | 126657 |
| chromium 149.0.7827.55 | d-all-race-width | canc-race-width-10 | 44140 | ±5.62% | 0.0227 | 4414 |
| chromium 149.0.7827.55 | e-cancel-storm | canc-cancel-storm-depth-50 | 6860 | ±4.63% | 0.1458 | 686 |
| firefox 151.0 | a-construct-resolve | native-construct-resolve | 263530 | ±22.14% | 0.0038 | 26353 |
| firefox 151.0 | a-construct-resolve | canc-construct-resolve | 46563 | ±39.82% | 0.0215 | 5215 |
| firefox 151.0 | b-then-chain | native-then-chain-10 | 33990 | ±36.52% | 0.0294 | 3399 |
| firefox 151.0 | b-then-chain | canc-then-chain-10 | 8275 | ±34.27% | 0.1209 | 844 |
| firefox 151.0 | c-fanout | native-fanout-100 | 3238 | ±32.86% | 0.3089 | 327 |
| firefox 151.0 | c-fanout | canc-fanout-100 | 351 | ±72.97% | 2.8491 | 53 |
| firefox 151.0 | d-all-race-width | native-all-width-10 | 6366 | ±45.76% | 0.1571 | 643 |
| firefox 151.0 | d-all-race-width | canc-all-width-10 | 660 | ±43.88% | 1.5143 | 70 |
| firefox 151.0 | d-all-race-width | native-all-width-1000 | 85 | ±20.18% | 11.7000 | 10 |
| firefox 151.0 | d-all-race-width | canc-all-width-1000 | 7 | ±1.55% | 142.2000 | 10 |
| firefox 151.0 | d-all-race-width | native-race-width-10 | 8362 | ±44.29% | 0.1196 | 878 |
| firefox 151.0 | d-all-race-width | canc-race-width-10 | 448 | ±39.66% | 2.2340 | 47 |
| firefox 151.0 | e-cancel-storm | canc-cancel-storm-depth-50 | 83 | ±19.67% | 12.0000 | 10 |
| webkit 26.5 | a-construct-resolve | native-construct-resolve | 5813970 | ±19.60% | 0.0002 | 581397 |
| webkit 26.5 | a-construct-resolve | canc-construct-resolve | 358730 | ±19.57% | 0.0028 | 35873 |
| webkit 26.5 | b-then-chain | native-then-chain-10 | 2492820 | ±19.60% | 0.0004 | 249282 |
| webkit 26.5 | b-then-chain | canc-then-chain-10 | 63290 | ±19.45% | 0.0158 | 6329 |
| webkit 26.5 | c-fanout | native-fanout-100 | 150000 | ±19.54% | 0.0067 | 15000 |
| webkit 26.5 | c-fanout | canc-fanout-100 | 3160 | ±16.47% | 0.3165 | 316 |
| webkit 26.5 | d-all-race-width | native-all-width-10 | 2003430 | ±19.60% | 0.0005 | 200343 |
| webkit 26.5 | d-all-race-width | canc-all-width-10 | 40320 | ±19.36% | 0.0248 | 4032 |
| webkit 26.5 | d-all-race-width | native-all-width-1000 | 26260 | ±19.23% | 0.0381 | 2626 |
| webkit 26.5 | d-all-race-width | canc-all-width-1000 | 400 | ±10.45% | 2.5000 | 40 |
| webkit 26.5 | d-all-race-width | native-race-width-10 | 1897160 | ±19.59% | 0.0005 | 189716 |
| webkit 26.5 | d-all-race-width | canc-race-width-10 | 25930 | ±19.22% | 0.0386 | 2593 |
| webkit 26.5 | e-cancel-storm | canc-cancel-storm-depth-50 | 3680 | ±16.75% | 0.2717 | 368 |

