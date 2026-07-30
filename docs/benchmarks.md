# canc benchmarks

**Generated doc — do not hand-edit.** Regenerate with `npm run bench:report` after (re)running suites; source data lives in `benchmarks/results/*.json`, generator is `benchmarks/generate-report.js`.

## Methodology

**Hardware / environment.** Each suite captures its own `env` block at run time: Node version, OS platform/arch, CPU model + logical core count, ISO timestamp. See the per-suite headers below for the exact machine each number came from — numbers are NOT normalized across machines, so don't diff two results/*.json captured on different hardware and read the delta as signal.

**Runs.** Node-lane suites use [tinybench](https://github.com/tinylibs/tinybench) (warmup pass + timed run, default `time: 100`/`iterations: 10` per case, overridable per suite) reporting ops/sec, relative margin of error (rme), mean, and sample count. The macro-realworld suite is self-timed (`process.hrtime`-style, no tinybench) because it measures whole simulated flows (waterfalls, component lifecycles) rather than isolated hot-loop cases; it also samples `process.memoryUsage().heapUsed` with `--expose-gc` for per-1k-in-flight memory figures. The browser lane runs the same tinybench cases inside real chromium/firefox/webkit pages via Playwright, loading the built UMD bundles — not the Node-lane source — so it also catches build/bundling regressions.

**Baselines.** Only **native `Promise`** and **bluebird** (`cancellation: true`) are benchmarked as baselines — c-promise2/p-cancelable/alkemics were dropped from bench deps per decision. bluebird is not always a like-for-like comparison: a canceled bluebird promise never settles by design, so any flow that awaits a canceled chain to completion (e.g. the lifecycle macro) marks bluebird `lifecycleComparable: false` and its number reflects only the synchronous cancel call, not equivalent work — see the footnote on that table.

**"Microbenchmarks lie" disclaimer.** Numbers here measure isolated hot loops (construct, chain, fanout, all/race, cancel storm) run thousands to millions of times back-to-back — a regime real applications rarely hit. JIT warmup, inlining, and deopt behavior in a tight microbenchmark loop can differ substantially from a promise chain that runs once per user action alongside real I/O. Treat ops/sec columns as **relative** signal ("canc chain-10 is roughly Nx slower than native chain-10 on this machine, this Node version"), not as an absolute cost you can multiply into a production budget. The macro-realworld suite exists specifically to counter this — it simulates whole request flows instead of isolated ops — but even that is a simulation (setImmediate-based mock fetch, no real network/timer jitter), not a real app. Margin-of-error columns matter: wide margins (commonly seen in the browser lane, especially firefox/webkit under Playwright) mean the number is noisy, not necessarily wrong — don't over-read small deltas inside the margin.

**Optimization pass.** Numbers below are post-optimization: per-instance memory layout, derived-promise construction, combinator internals, and the cancellation path have all been tuned since the original baseline. Construction and memory footprint improved substantially; chain/combinator throughput improved but remains behind bluebird on some cases because closing the gap further would mean bypassing the native species-constructor machinery this library is built on — a tradeoff not taken here. This doc reports numbers as measured, not as targets.

## Summary (README embed)

| Suite                                         | Headline comparison                                                  |
| --------------------------------------------- | -------------------------------------------------------------------- |
| micro: then-chain depth 10                    | native 1,996,316 ops/s · canc 211,880 ops/s · bluebird 283,575 ops/s |
| micro-alloc: 10k promises                     | native 57B/promise · canc 382B/promise · bluebird 121B/promise       |
| macro: waterfall (5+3 requests, 30% canceled) | canc +45% vs native · bluebird +20% vs native                        |
| browser-lane                                  | ran in chromium 149.0.7827.55, firefox 151.0, webkit 26.5            |

## Full results

### browser-lane

Playwright, UMD dist bundles loaded in-page. Node-lane numbers above are NOT directly comparable to these (different engines, different harness overhead) — browser lane exists to catch cross-engine regressions, not to be read against Node numbers.

| Browser                | Suite                   | Case                       |  ops/sec |  margin | mean (ms) | samples |
| ---------------------- | ----------------------- | -------------------------- | -------: | ------: | --------: | ------: |
| chromium 149.0.7827.55 | a-construct-resolve     | native-construct-resolve   |  6899500 |  ±6.22% |    0.0001 |  689950 |
| chromium 149.0.7827.55 | a-construct-resolve     | canc-construct-resolve     |  1477770 |  ±6.26% |    0.0007 |  147777 |
| chromium 149.0.7827.55 | b-then-chain            | native-then-chain-10       |  2308750 |  ±6.22% |    0.0004 |  230875 |
| chromium 149.0.7827.55 | b-then-chain            | canc-then-chain-10         |   372098 |  ±9.29% |    0.0027 |   37247 |
| chromium 149.0.7827.55 | c-fanout                | native-fanout-100          |      n/a |  ±0.00% |    0.0000 |   15585 |
| chromium 149.0.7827.55 | c-fanout                | canc-fanout-100            |    15379 |  ±4.27% |    0.0650 |    1135 |
| chromium 149.0.7827.55 | d-all-race-width        | native-all-width-10        |  1459481 |  ±6.30% |    0.0007 |  146094 |
| chromium 149.0.7827.55 | d-all-race-width        | canc-all-width-10          |      n/a |  ±0.00% |    0.0000 |    9968 |
| chromium 149.0.7827.55 | d-all-race-width        | native-all-width-1000      |    50050 |  ±7.18% |    0.0200 |    2983 |
| chromium 149.0.7827.55 | d-all-race-width        | canc-all-width-1000        |     1653 |  ±3.28% |    0.6049 |     123 |
| chromium 149.0.7827.55 | d-all-race-width        | native-race-width-10       |  1322040 |  ±6.22% |    0.0008 |  132204 |
| chromium 149.0.7827.55 | d-all-race-width        | canc-race-width-10         |   886952 | ±21.52% |    0.0011 |    7273 |
| chromium 149.0.7827.55 | e-cancel-storm          | canc-cancel-storm-depth-50 |    83355 |  ±8.47% |    0.0120 |    3926 |
| chromium 149.0.7827.55 | h-bubble-leaf           | canc-bubble-leaf-10        |     8079 |  ±2.64% |    0.1238 |     652 |
| chromium 149.0.7827.55 | i-allsettled-any        | native-allSettled-100      |      n/a |  ±0.00% |    0.0000 |    9870 |
| chromium 149.0.7827.55 | i-allsettled-any        | canc-allSettled-100        |     8571 |  ±2.96% |    0.1167 |     678 |
| chromium 149.0.7827.55 | i-allsettled-any        | native-any-100             |      n/a |  ±0.00% |    0.0000 |   12974 |
| chromium 149.0.7827.55 | i-allsettled-any        | canc-any-100               |     9975 |  ±3.33% |    0.1003 |     787 |
| chromium 149.0.7827.55 | j-signal-construct      | native-construct-resolve   |  6163000 |  ±6.80% |    0.0002 |  616300 |
| chromium 149.0.7827.55 | j-signal-construct      | canc-signal-construct      |    34970 |  ±6.39% |    0.0286 |    2350 |
| chromium 149.0.7827.55 | k-then-settled          | native-then-settled        |  6088062 |  ±6.20% |    0.0002 |  609415 |
| chromium 149.0.7827.55 | k-then-settled          | canc-then-settled          |  1334386 |  ±6.20% |    0.0007 |  133572 |
| chromium 149.0.7827.55 | l-handlecancel-register | native-construct-resolve   |  5630980 |  ±6.23% |    0.0002 |  563098 |
| chromium 149.0.7827.55 | l-handlecancel-register | canc-handleCancel-register |  1420290 | ±18.34% |    0.0007 |  142171 |
| firefox 151.0          | a-construct-resolve     | native-construct-resolve   |   121903 |  ±8.86% |    0.0082 |     378 |
| firefox 151.0          | a-construct-resolve     | canc-construct-resolve     |    10857 |  ±4.76% |    0.0921 |      36 |
| firefox 151.0          | b-then-chain            | native-then-chain-10       |     4672 |  ±2.64% |    0.2141 |      74 |
| firefox 151.0          | b-then-chain            | canc-then-chain-10         |     1072 |  ±6.67% |    0.9328 |     408 |
| firefox 151.0          | c-fanout                | native-fanout-100          |      299 |  ±2.27% |    3.3455 |     322 |
| firefox 151.0          | c-fanout                | canc-fanout-100            |       62 |  ±3.60% |   16.1314 |     236 |
| firefox 151.0          | d-all-race-width        | native-all-width-10        |     1874 | ±12.82% |    0.5337 |     349 |
| firefox 151.0          | d-all-race-width        | canc-all-width-10          |      233 |  ±4.40% |    4.2840 |     169 |
| firefox 151.0          | d-all-race-width        | native-all-width-1000      |       22 |  ±6.00% |   46.1348 |      89 |
| firefox 151.0          | d-all-race-width        | canc-all-width-1000        |        3 |  ±1.05% |  343.4167 |      24 |
| firefox 151.0          | d-all-race-width        | native-race-width-10       |     5114 | ±21.86% |    0.1955 |     895 |
| firefox 151.0          | d-all-race-width        | canc-race-width-10         |      211 | ±13.48% |    4.7401 |     377 |
| firefox 151.0          | e-cancel-storm          | canc-cancel-storm-depth-50 |     2321 |  ±2.88% |    0.4309 |    1743 |
| firefox 151.0          | h-bubble-leaf           | canc-bubble-leaf-10        |      297 |  ±2.60% |    3.3663 |     384 |
| firefox 151.0          | i-allsettled-any        | native-allSettled-100      |      352 |  ±4.49% |    2.8441 |     217 |
| firefox 151.0          | i-allsettled-any        | canc-allSettled-100        |      496 |  ±5.17% |    2.0148 |    1220 |
| firefox 151.0          | i-allsettled-any        | native-any-100             |      727 |  ±2.88% |    1.3748 |     303 |
| firefox 151.0          | i-allsettled-any        | canc-any-100               |       42 |  ±3.06% |   23.7725 |     167 |
| firefox 151.0          | j-signal-construct      | native-construct-resolve   |    28266 |  ±0.67% |    0.0354 |      97 |
| firefox 151.0          | j-signal-construct      | canc-signal-construct      |     3562 |  ±4.05% |    0.2807 |      57 |
| firefox 151.0          | k-then-settled          | native-then-settled        |    36975 |  ±2.71% |    0.0270 |     121 |
| firefox 151.0          | k-then-settled          | canc-then-settled          |     5757 |  ±0.89% |    0.1737 |      94 |
| firefox 151.0          | l-handlecancel-register | native-construct-resolve   |    28374 |  ±0.96% |    0.0352 |      96 |
| firefox 151.0          | l-handlecancel-register | canc-handleCancel-register |     3631 |  ±6.76% |    0.2754 |      24 |
| webkit 26.5            | a-construct-resolve     | native-construct-resolve   | 17783200 |  ±3.46% |    0.0001 |   44458 |
| webkit 26.5            | a-construct-resolve     | canc-construct-resolve     |  1976557 |  ±2.49% |    0.0005 |    4019 |
| webkit 26.5            | b-then-chain            | native-then-chain-10       |  3373748 |  ±3.34% |    0.0003 |    6233 |
| webkit 26.5            | b-then-chain            | canc-then-chain-10         |   199396 |  ±1.48% |    0.0050 |     385 |
| webkit 26.5            | c-fanout                | native-fanout-100          |   148079 |  ±1.20% |    0.0068 |     289 |
| webkit 26.5            | c-fanout                | canc-fanout-100            |    11613 |  ±1.70% |    0.0861 |     317 |
| webkit 26.5            | d-all-race-width        | native-all-width-10        |  2328411 |  ±2.79% |    0.0004 |    4651 |
| webkit 26.5            | d-all-race-width        | canc-all-width-10          |   129094 |  ±1.91% |    0.0077 |     247 |
| webkit 26.5            | d-all-race-width        | native-all-width-1000      |    26187 |  ±1.14% |    0.0382 |     247 |
| webkit 26.5            | d-all-race-width        | canc-all-width-1000        |     1725 |  ±1.64% |    0.5797 |     219 |
| webkit 26.5            | d-all-race-width        | native-race-width-10       |  2890435 |  ±3.13% |    0.0003 |    5540 |
| webkit 26.5            | d-all-race-width        | canc-race-width-10         |    76563 |  ±1.75% |    0.0131 |     150 |
| webkit 26.5            | e-cancel-storm          | canc-cancel-storm-depth-50 |    14680 |  ±2.36% |    0.0681 |     135 |
| webkit 26.5            | h-bubble-leaf           | canc-bubble-leaf-10        |    20016 |  ±1.39% |    0.0500 |    1905 |
| webkit 26.5            | i-allsettled-any        | native-allSettled-100      |   221897 |  ±1.15% |    0.0045 |     429 |
| webkit 26.5            | i-allsettled-any        | canc-allSettled-100        |     7171 |  ±2.03% |    0.1395 |     261 |
| webkit 26.5            | i-allsettled-any        | native-any-100             |   283683 |  ±0.90% |    0.0035 |     552 |
| webkit 26.5            | i-allsettled-any        | canc-any-100               |     7917 |  ±1.90% |    0.1263 |     218 |
| webkit 26.5            | j-signal-construct      | native-construct-resolve   | 16303600 |  ±3.48% |    0.0001 |   40759 |
| webkit 26.5            | j-signal-construct      | canc-signal-construct      |    12470 | ±12.60% |    0.0802 |      26 |
| webkit 26.5            | k-then-settled          | native-then-settled        | 14909600 |  ±3.46% |    0.0001 |   37274 |
| webkit 26.5            | k-then-settled          | canc-then-settled          |  1422422 |  ±1.57% |    0.0007 |    2897 |
| webkit 26.5            | l-handlecancel-register | native-construct-resolve   | 17505200 |  ±3.51% |    0.0001 |   43763 |
| webkit 26.5            | l-handlecancel-register | canc-handleCancel-register |  1555216 |  ±1.93% |    0.0006 |    3056 |

### macro-realworld

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · captured 2026-07-16T15:15:35.572Z

Flows: waterfall (5 sequential + 3 parallel requests, 30% canceled mid-flight) × 20,000 · component-lifecycle (mount → 3 requests → unmount-cancel) × 10,000.

#### Waterfall — overhead per request operation

| Impl                               | µs/op | vs native | µs/run | total ms |
| ---------------------------------- | ----: | --------: | -----: | -------: |
| native (Promise + AbortController) | 1.642 |         — | 13.140 |      263 |
| canc (CancelablePromise)           | 2.376 |    +44.7% | 19.011 |      380 |
| bluebird (cancellation:true)       | 1.978 |    +20.5% | 15.828 |      317 |

#### Component-lifecycle — overhead per request operation

| Impl                               |  µs/op | vs native | µs/run | total ms |
| ---------------------------------- | -----: | --------: | -----: | -------: |
| native (Promise + AbortController) |  3.973 |         — | 11.919 |      119 |
| canc (CancelablePromise)           | 19.302 |   +385.8% | 57.905 |      579 |
| bluebird (cancellation:true)*      |  0.847 |      n/c* |  2.540 |       25 |

\* Not comparable: a canceled bluebird promise never settles by design, so its lifecycle flow cannot be awaited to completion like native/canc — only the synchronous cancel work is timed.

#### Memory — retained heap per 1000 in-flight requests

| Impl                               | MB / 1k in-flight |
| ---------------------------------- | ----------------: |
| native (Promise + AbortController) |              1.30 |
| canc (CancelablePromise)           |              3.21 |
| bluebird (cancellation:true)       |              0.87 |

### micro-alloc

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · captured 2026-07-11T14:49:13.497Z

| Impl     | count | heap delta (KB) | bytes/promise | GC during alloc |
| -------- | ----: | --------------: | ------------: | --------------: |
| native   | 10000 |           556.5 |            57 |               0 |
| canc     | 10000 |          3734.5 |           382 |               0 |
| bluebird | 10000 |          1185.6 |           121 |               0 |

### micro

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · captured 2026-07-16T15:14:48.939Z

| Case                           | ops/sec |  margin | mean (ms) | samples |
| ------------------------------ | ------: | ------: | --------: | ------: |
| a/construct-resolve native     | 9283401 |  ±3.23% |    0.0001 |  928342 |
| a/construct-resolve canc       |  934626 | ±14.95% |    0.0011 |   93463 |
| a/construct-resolve bluebird   |  600786 | ±10.76% |    0.0017 |   60079 |
| b/chain-1 native               | 8334450 |  ±2.39% |    0.0001 |  833445 |
| b/chain-1 canc                 |  685678 | ±29.64% |    0.0015 |   68622 |
| b/chain-1 bluebird             |  571274 |  ±3.34% |    0.0018 |   57128 |
| b/chain-10 native              | 1996316 |  ±2.98% |    0.0005 |  199632 |
| b/chain-10 canc                |  211880 |  ±2.67% |    0.0047 |   21188 |
| b/chain-10 bluebird            |  283575 |  ±3.44% |    0.0035 |   28358 |
| b/chain-100 native             |  286624 |  ±3.47% |    0.0035 |   28663 |
| b/chain-100 canc               |   25771 |  ±4.78% |    0.0388 |    2586 |
| b/chain-100 bluebird           |   56964 |  ±3.24% |    0.0176 |    5697 |
| c/fanout-100 native            |  159284 |  ±2.93% |    0.0063 |   15929 |
| c/fanout-100 canc              |    8649 |  ±4.40% |    0.1156 |     865 |
| c/fanout-100 bluebird          |   45637 |  ±3.84% |    0.0219 |    4565 |
| d/all-10 native                | 1190543 |  ±3.69% |    0.0008 |  119055 |
| d/all-10 canc                  |   73366 |  ±5.70% |    0.0136 |    7337 |
| d/all-10 bluebird              |  405823 |  ±7.29% |    0.0025 |   40583 |
| d/all-1000 native              |   23604 |  ±3.70% |    0.0424 |    2361 |
| d/all-1000 canc                |     865 | ±12.40% |    1.1557 |      87 |
| d/all-1000 bluebird            |   27206 |  ±2.94% |    0.0368 |    2721 |
| d/race-10 native               |  452973 |  ±3.36% |    0.0022 |   45298 |
| d/race-10 canc                 |   70873 |  ±4.00% |    0.0141 |    7088 |
| d/race-10 bluebird             |  320060 |  ±5.83% |    0.0031 |   32007 |
| d/race-1000 native             |    5089 |  ±7.37% |    0.1965 |     514 |
| d/race-1000 canc               |     726 | ±14.18% |    1.3782 |      73 |
| d/race-1000 bluebird           |    7735 |  ±7.53% |    0.1293 |     774 |
| e/cancel-storm-50 canc         |   13005 |  ±7.78% |    0.0769 |    1301 |
| e/cancel-storm-50 bluebird     |   95177 |  ±4.38% |    0.0105 |    9518 |
| h/bubble-leaf-10 canc          |    3677 |  ±5.44% |    0.2720 |     368 |
| i/allSettled-100 native        |   69778 |  ±2.22% |    0.0143 |    6978 |
| i/allSettled-100 canc          |    5577 |  ±6.83% |    0.1793 |     558 |
| i/any-100 native               |   47089 |  ±3.76% |    0.0212 |    4709 |
| i/any-100 canc                 |    7433 |  ±7.47% |    0.1345 |     744 |
| j/signal-construct native      | 6587380 |  ±5.09% |    0.0002 |  658738 |
| j/signal-construct canc        |   23938 | ±23.10% |    0.0418 |    2394 |
| k/then-settled native          | 8810640 |  ±5.51% |    0.0001 |  881064 |
| k/then-settled canc            | 1114779 |  ±2.51% |    0.0009 |  111478 |
| l/handleCancel-register native | 9109740 |  ±2.94% |    0.0001 |  910974 |
| l/handleCancel-register canc   |  874720 |  ±4.41% |    0.0011 |   87472 |
| f/coroutine-100 native-async   |  220306 |  ±4.87% |    0.0045 |   22031 |
| f/coroutine-100 canc-cancAsync |    7664 | ±14.03% |    0.1305 |     767 |

### smoke

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · captured 2026-07-16T15:15:00.537Z

| Case                   |  ops/sec | margin | mean (ms) | samples |
| ---------------------- | -------: | -----: | --------: | ------: |
| native-promise-resolve | 10287570 | ±1.64% |    0.0001 | 1028758 |
| noop                   | 24161840 | ±2.43% |    0.0000 | 2416184 |
