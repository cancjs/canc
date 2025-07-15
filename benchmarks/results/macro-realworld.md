## Suite: macro-realworld

Node v24.6.0 · win32/x64 · 12th Gen Intel(R) Core(TM) i7-12700KF (16 cores) · 2026-07-11T09:18:01.896Z

Flows: waterfall (5 sequential + 3 parallel requests, 30% canceled mid-flight) × 20 000 · component-lifecycle (mount → 3 requests → unmount-cancel) × 10 000.

### Waterfall — overhead per request operation

| Impl | µs/op | vs native | µs/run | total ms |
|------|------:|----------:|-------:|---------:|
| native (Promise + AbortController) | 1.201 | — | 9.608 | 192 |
| canc (CancelablePromise) | 2.199 | +83.1% | 17.591 | 352 |
| bluebird (cancellation:true) | 1.942 | +61.7% | 15.533 | 311 |

### Component-lifecycle — overhead per request operation

| Impl | µs/op | vs native | µs/run | total ms |
|------|------:|----------:|-------:|---------:|
| native (Promise + AbortController) | 3.649 | — | 10.947 | 109 |
| canc (CancelablePromise) | 16.929 | +364.0% | 50.788 | 508 |
| bluebird (cancellation:true)* | 0.662 | n/c* | 1.987 | 20 |

\* Not comparable: a canceled bluebird promise never settles by design, so its lifecycle flow cannot be awaited to completion like native/canc — only the synchronous cancel work is timed.

### Memory — retained heap per 1000 in-flight requests

| Impl | MB / 1k in-flight |
|------|------------------:|
| native (Promise + AbortController) | 1.18 |
| canc (CancelablePromise) | 2.97 |
| bluebird (cancellation:true) | 0.83 |

### Summary

In a simulated app — a 5-then-3 request waterfall and a mount/unmount-cancel component lifecycle — canc's cancelable promises come out 83% slower than native (~1.00 µs extra per request) on the waterfall and are far behind native on the cancel-heavy lifecycle flow (+364%), while giving you cancellation as a first-class rejection instead of hand-rolled AbortController wiring. Bluebird's cancellation runs 62% slower than native on the same waterfall (its lifecycle flow is not directly comparable — canceled bluebird promises never settle). Holding 1,000 requests in flight, canc retains about 1.8 MB more heap per 1,000 than the hand-rolled AbortController baseline (3.0 MB vs 1.2 MB per 1k). Bottom line: cancelable promises are not free — the cost is a real per-operation tax that grows with how much cancellation the flow does (see the lifecycle row) — but it buys real, try/catch-native cancellation without the manual AbortController plumbing the baseline needs. For I/O-bound flows the tax is dwarfed by network and timer latency; for hot, cancel-dense loops it is worth measuring against your own budget.

