# app-crawler-race

A site-health crawl. Starting from the home page, the crawler fans out two levels deep through a
fixed-concurrency pool, fetching every linked page and reporting the broken (404) ones. Partway
through, the operator hits Stop. With canc, one `cancel()` on the crawl root prunes the entire
in-flight subtree at every depth. The vanilla twin threads a hand-rolled abort and still leaks.

Domain: crawling your own website to find dead links.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a npm `file:`. Build the
monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
npm run build
cd examples
npm install
```

## Run

```
npm run start:vanilla --workspace=app-crawler-race
npm run start:canc --workspace=app-crawler-race
npm run test --workspace=app-crawler-race
```

Both entries crawl the site depth-2, then abandon the crawl mid-flight, and print how many page
fetches were started, aborted, or completed.

## What it shows

- **One cancel() prunes the whole subtree.** The crawl root is a `CancelablePromise`. Its cancel
 handler calls `pool.cancelAll()` once. That drains the pool in a single call: pages still queued
 never start (born-canceled) and pages in flight are aborted at the request boundary. There is no
 per-level plumbing. The same cancel reaches a fetch at depth 0 and a fetch at depth 2 alike,
 because cancellation propagates down the tree of cancelable nodes on its own.
- **The vanilla twin makes the fair attempt and still leaks.** `crawl-vanilla.ts` threads a real
 abort: the queue tracks each running fetch's `AbortController` and Stop aborts them. But a queued
 fetch has no controller yet, so draining the queue cannot stop it, and the fetches dispatched a
 tick before Stop already left with their own signal. The result: aborting the running fetches
 makes the crawl reject, yet the queued and in-flight pages run to completion anyway. The
 `completed` count keeps climbing after Stop. That is the grandchild leak the pool avoids.
- **Cancel-aware concurrency pool.** The pool comes from `@shared/lib` (`createPool`). It runs at
 most four fetches at once and exposes `cancelAll(reason)`, which drops the queue and cancels every
 in-flight job. It is a seed for a future published p-limit-style package.

## File map (what to diff)

- `src/crawl-vanilla.ts` vs `src/crawl-canc.ts`: the crawl. Same `visit` recursion and function
 order. Vanilla threads a per-fetch `AbortController` through a plain queue with a best-effort
 abort; canc runs each fetch as a `cancelify` node through the shared pool and cancels the root.
- `src/main-vanilla.ts` vs `src/main-canc.ts`: the scenario, same narrative.

## Copy freely

The pool lives in `@shared/lib` and depends only on `@cancjs/promise`. Copy it into your own
project as-is; it is a seed for a future published package.

## Honesty notes

Cancellation here stops work at the request boundary. `cancel()` aborts the mock API's in-flight
fetches (you see `aborted` markers in `api.calls`) and prevents queued fetches from starting. It
does not reach into a real web server to undo work a request already triggered there. What you save
is the fetches you never send and the in-flight fetches you abort locally.

`src/mock/` is scaffolding standing in for a real website and its HTTP layer. Treat it as a black
box.
