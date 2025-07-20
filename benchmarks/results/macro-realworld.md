## Suite: macro-realworld

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · 2026-07-16T15:15:35.572Z

Flows: waterfall (5 sequential + 3 parallel requests, 30% canceled mid-flight) × 20 000 · component-lifecycle (mount → 3 requests → unmount-cancel) × 10 000.

### Waterfall — overhead per request operation

| Impl | µs/op | vs native | µs/run | total ms |
|------|------:|----------:|-------:|---------:|
| native (Promise + AbortController) | 1.642 | — | 13.140 | 263 |
| canc (CancelablePromise) | 2.376 | +44.7% | 19.011 | 380 |
| bluebird (cancellation:true) | 1.978 | +20.5% | 15.828 | 317 |

### Component-lifecycle — overhead per request operation

| Impl | µs/op | vs native | µs/run | total ms |
|------|------:|----------:|-------:|---------:|
| native (Promise + AbortController) | 3.973 | — | 11.919 | 119 |
| canc (CancelablePromise) | 19.302 | +385.8% | 57.905 | 579 |
| bluebird (cancellation:true)* | 0.847 | n/c* | 2.540 | 25 |

\* Not comparable: a canceled bluebird promise never settles by design, so its lifecycle flow cannot be awaited to completion like native/canc — only the synchronous cancel work is timed.

### Memory — retained heap per 1000 in-flight requests

| Impl | MB / 1k in-flight |
|------|------------------:|
| native (Promise + AbortController) | 1.24 |
| canc (CancelablePromise) | 3.06 |
| bluebird (cancellation:true) | 0.83 |

### Summary

In a simulated app — a 5-then-3 request waterfall and a mount/unmount-cancel component lifecycle — canc's cancelable promises come out 45% slower than native (~0.73 µs extra per request) on the waterfall and are far behind native on the cancel-heavy lifecycle flow (+386%), while giving you cancellation as a first-class rejection instead of hand-rolled AbortController wiring. Bluebird's cancellation runs 20% slower than native on the same waterfall (its lifecycle flow is not directly comparable — canceled bluebird promises never settle). Holding 1,000 requests in flight, canc retains about 1.8 MB more heap per 1,000 than the hand-rolled AbortController baseline (3.1 MB vs 1.2 MB per 1k). Bottom line: cancelable promises are not free — the cost is a real per-operation tax that grows with how much cancellation the flow does (see the lifecycle row) — but it buys real, try/catch-native cancellation without the manual AbortController plumbing the baseline needs. For I/O-bound flows the tax is dwarfed by network and timer latency; for hot, cancel-dense loops it is worth measuring against your own budget.

