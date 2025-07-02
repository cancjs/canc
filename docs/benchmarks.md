# canc benchmarks

**Generated doc — do not hand-edit.** Regenerate with `yarn bench:report` after (re)running suites; source data lives in `benchmarks/results/*.json`, generator is `benchmarks/generate-report.js`.

## Methodology

**Hardware / environment.** Each suite captures its own `env` block at run time: Node version, OS platform/arch, CPU model + logical core count, ISO timestamp. See the per-suite headers below for the exact machine each number came from — numbers are NOT normalized across machines, so don't diff two results/*.json captured on different hardware and read the delta as signal.

**Runs.** Node-lane suites use [tinybench](https://github.com/tinylibs/tinybench) (warmup pass + timed run, default `time: 100`/`iterations: 10` per case, overridable per suite) reporting ops/sec, relative margin of error (rme), mean, and sample count. The macro-realworld suite is self-timed (`process.hrtime`-style, no tinybench) because it measures whole simulated flows (waterfalls, component lifecycles) rather than isolated hot-loop cases; it also samples `process.memoryUsage().heapUsed` with `--expose-gc` for per-1k-in-flight memory figures. The browser lane (P3-4) runs the same tinybench cases inside real chromium/firefox/webkit pages via Playwright, loading the built UMD bundles — not the Node-lane source — so it also catches build/bundling regressions.

**Baselines.** Only **native `Promise`** and **bluebird** (`cancellation: true`) are benchmarked as baselines — c-promise2/p-cancelable/alkemics were dropped from bench deps per decision D14 (`.claude/decisions.md`). bluebird is not always a like-for-like comparison: a canceled bluebird promise never settles by design, so any flow that awaits a canceled chain to completion (e.g. the lifecycle macro) marks bluebird `lifecycleComparable: false` and its number reflects only the synchronous cancel call, not equivalent work — see the footnote on that table.

**"Microbenchmarks lie" disclaimer.** Numbers here measure isolated hot loops (construct, chain, fanout, all/race, cancel storm) run thousands to millions of times back-to-back — a regime real applications rarely hit. JIT warmup, inlining, and deopt behavior in a tight microbenchmark loop can differ substantially from a promise chain that runs once per user action alongside real I/O. Treat ops/sec columns as **relative** signal ("canc chain-10 is roughly Nx slower than native chain-10 on this machine, this Node version"), not as an absolute cost you can multiply into a production budget. The macro-realworld suite exists specifically to counter this — it simulates whole request flows instead of isolated ops — but even that is a simulation (setImmediate-based mock fetch, no real network/timer jitter), not a real app. Margin-of-error columns matter: wide margins (commonly seen in the browser lane, especially firefox/webkit under Playwright) mean the number is noisy, not necessarily wrong — don't over-read small deltas inside the margin.

**Out of scope.** This phase () collects numbers only — no optimization work was performed based on these results. Unflattering numbers are expected and intentional; they feed later optimization-phase decisions, not this one.

## Summary (README embed)

| Suite | Headline comparison |
|-------|----------------------|
| micro: then-chain depth 10 | native 2,085,208 ops/s · canc 87,600 ops/s · bluebird 279,988 ops/s |
| micro-alloc: 10k promises | native 57B/promise · canc 1493B/promise · bluebird 122B/promise |
| macro: waterfall (5+3 requests, 30% canceled) | canc +140% vs native · bluebird +42% vs native |
| browser-lane | ran in chromium 149.0.7827.55, firefox 151.0, webkit 26.5 |

## Full results

### browser-lane

Playwright, UMD dist bundles loaded in-page (P3-4). Node-lane numbers above are NOT directly comparable to these (different engines, different harness overhead) — browser lane exists to catch cross-engine regressions, not to be read against Node numbers.

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

### macro-realworld

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · captured 2026-07-10T11:20:52.829Z

Flows: waterfall (5 sequential + 3 parallel requests, 30% canceled mid-flight) × 20,000 · component-lifecycle (mount → 3 requests → unmount-cancel) × 10,000.

#### Waterfall — overhead per request operation

| Impl | µs/op | vs native | µs/run | total ms |
|------|------:|----------:|-------:|---------:|
| native (Promise + AbortController) | 1.330 | — | 10.639 | 213 |
| canc (CancelablePromise) | 3.186 | +139.5% | 25.485 | 510 |
| bluebird (cancellation:true) | 1.887 | +41.9% | 15.092 | 302 |

#### Component-lifecycle — overhead per request operation

| Impl | µs/op | vs native | µs/run | total ms |
|------|------:|----------:|-------:|---------:|
| native (Promise + AbortController) | 3.587 | — | 10.762 | 108 |
| canc (CancelablePromise) | 16.935 | +372.1% | 50.804 | 508 |
| bluebird (cancellation:true)* | 0.699 | n/c* | 2.098 | 21 |

\* Not comparable: a canceled bluebird promise never settles by design, so its lifecycle flow cannot be awaited to completion like native/canc — only the synchronous cancel work is timed.

#### Memory — retained heap per 1000 in-flight requests

| Impl | MB / 1k in-flight |
|------|------------------:|
| native (Promise + AbortController) | 1.25 |
| canc (CancelablePromise) | 5.39 |
| bluebird (cancellation:true) | 0.87 |

### micro-alloc

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · captured 2026-07-10T11:18:17.976Z

| Impl | count | heap delta (KB) | bytes/promise | GC during alloc |
|------|------:|----------------:|--------------:|----------------:|
| native | 10000 | 556.5 | 57 | 0 |
| canc | 10000 | 14583.6 | 1493 | 0 |
| bluebird | 10000 | 1192.2 | 122 | 0 |

### micro

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · captured 2026-07-10T11:18:10.926Z

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

### smoke

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · captured 2026-07-10T11:15:24.253Z

| Case | ops/sec | margin | mean (ms) | samples |
|------|--------:|-------:|----------:|--------:|
| native-promise-resolve | 11055578 | ±0.73% | 0.0001 | 1105560 |
| noop | 24860765 | ±0.42% | 0.0000 | 2486079 |
