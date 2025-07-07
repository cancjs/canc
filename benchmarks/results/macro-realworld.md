## Suite: macro-realworld

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · 2026-07-11T03:36:34.779Z

Flows: waterfall (5 sequential + 3 parallel requests, 30% canceled mid-flight) × 20 000 · component-lifecycle (mount → 3 requests → unmount-cancel) × 10 000.

### Waterfall — overhead per request operation

| Impl | µs/op | vs native | µs/run | total ms |
|------|------:|----------:|-------:|---------:|
| native (Promise + AbortController) | 1.267 | — | 10.136 | 203 |
| canc (CancelablePromise) | 3.215 | +153.8% | 25.722 | 514 |
| bluebird (cancellation:true) | 1.933 | +52.6% | 15.464 | 309 |

### Component-lifecycle — overhead per request operation

| Impl | µs/op | vs native | µs/run | total ms |
|------|------:|----------:|-------:|---------:|
| native (Promise + AbortController) | 3.471 | — | 10.412 | 104 |
| canc (CancelablePromise) | 17.150 | +394.2% | 51.451 | 515 |
| bluebird (cancellation:true)* | 0.796 | n/c* | 2.389 | 24 |

\* Not comparable: a canceled bluebird promise never settles by design, so its lifecycle flow cannot be awaited to completion like native/canc — only the synchronous cancel work is timed.

### Memory — retained heap per 1000 in-flight requests

_Memory not measured — run with `node --expose-gc` for per-1k heap numbers._

### Summary

In a simulated app — a 5-then-3 request waterfall and a mount/unmount-cancel component lifecycle — canc's cancelable promises come out 154% slower than native (~1.95 µs extra per request) on the waterfall and are far behind native on the cancel-heavy lifecycle flow (+394%), while giving you cancellation as a first-class rejection instead of hand-rolled AbortController wiring. Bluebird's cancellation runs 53% slower than native on the same waterfall (its lifecycle flow is not directly comparable — canceled bluebird promises never settle). (Run with `node --expose-gc` to also see per-1,000-in-flight memory.) Bottom line: cancelable promises are not free — the cost is a real per-operation tax that grows with how much cancellation the flow does (see the lifecycle row) — but it buys real, try/catch-native cancellation without the manual AbortController plumbing the baseline needs. For I/O-bound flows the tax is dwarfed by network and timer latency; for hot, cancel-dense loops it is worth measuring against your own budget.

