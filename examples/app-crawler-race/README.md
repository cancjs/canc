# app-crawler-race

Supplier price comparison. The same part is quoted from several suppliers at once and the first
answer wins; each supplier's catalog is crawled two levels deep to locate the part. Cancellation
turns "first answer wins" into real savings and makes an abandoned crawl stop instead of running to
completion.

Domain: quoting an industrial part (`bearing-6203`) from three suppliers.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a yarn `link:`. Build the
monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
yarn build
cd examples
yarn
```

## Run

```
yarn workspace app-crawler-race start:vanilla
yarn workspace app-crawler-race start:canc
yarn workspace app-crawler-race test
```

Both entries run three scenarios: the any() quote race, an abandoned catalog crawl, and the two
combined (crawl, then quote).

## What it shows

- **any() cancels losers, and that is money.** `CancelablePromise.any` resolves with the first
 supplier to answer and cancels the rest. Each canceled input aborts its request, so exactly one
 quote call completes and the other N-1 are aborted. The vanilla twin uses `Promise.any`: it
 returns the same winner but the N-1 losing requests keep running to completion. For N suppliers
 that is N-1 supplier calls whose results are discarded. Every one of those is bandwidth you paid
 for and, against a metered supplier API, quota or money you spent for nothing. The canc twin
 spends one call; the vanilla twin spends N.
- **race() vs any().** Both cancel the losers in the canc flavor. `any()` waits for the first
 *fulfillment* (a rejecting supplier is ignored until all reject); `race()` takes the first
 *settlement* (a fast rejection wins the race). The `firstQuoteRace` functions in
 `compare-vanilla.ts` / `compare-canc.ts` show the variant.
- **Cancel-aware concurrency pool.** `src/lib/pool.ts` runs at most 4 catalog-page fetches at once.
 Canceling the crawl root drains the pool: in-flight page fetches are aborted and queued pages
 never start (born-canceled). One `cancel()` at the top reaches every level of the depth-2 crawl.

## File map (what to diff)

- `src/compare-vanilla.ts` vs `src/compare-canc.ts`: the quote race. Same function order and
 comment anchors; the bodies differ only in `Promise.any` vs `CancelablePromise.any` (plus the
 abort wiring the canc side needs).
- `src/crawl-vanilla.ts` vs `src/crawl-canc.ts`: the depth-2 crawl. Vanilla threads pages through a
 plain queue with no cancel path; canc threads them through the cancel-aware pool.
- `src/main-vanilla.ts` vs `src/main-canc.ts`: the three scenarios, same narrative.

## Copy freely

`src/lib/pool.ts` is written to be lifted into your own project as-is. It depends only on
`@cancjs/promise`. It is a seed for a future published p-limit-style package; until then, copy it.

## Honesty notes

Cancellation here stops work at the request boundary. `cancel()` aborts the mock API's in-flight
call (you see `aborted` markers in `mockApi.api.calls`) and prevents queued calls from starting. It
does not reach into a supplier's servers to undo work they already began; a request already
answered is already answered. What you save is the calls you never send and the in-flight calls you
abort locally.

`src/aux/` is scaffolding standing in for real supplier APIs. Treat it as a black box.
