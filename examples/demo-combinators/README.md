# demo-combinators

Teaching cancellation behavior of Promise combinators (all, any, race, allSettled) compared to native Promise.

## Domain

Dashboard bootstrap scenario: parallel widget loads (sales, traffic, alerts, news). One widget fails or a timeout triggers. How do the combinators behave?

## Files to compare

- `src/all-vanilla.ts` vs `src/all-canc.ts` — Promise.all keeps losers running; CancelablePromise.all cancels them.
- `src/any-vanilla.ts` vs `src/any-canc.ts` — Promise.any leaves losers running; CancelablePromise.any cancels them.
- `src/race-vanilla.ts` vs `src/race-canc.ts` — Promise.race leaves losers running; CancelablePromise.race cancels them.
- `src/all-settled-vanilla.ts` vs `src/all-settled-canc.ts` — allSettled waits everything; no cancel by definition.
- `src/isolation-vanilla.ts` vs `src/isolation-canc.ts` — manual flags vs bubble:false isolation option.

## Running

Install dependencies first in the repo root:
```bash
npm run build
cd examples
npm install
```

Then in this directory:

```bash
# Vanilla (native Promise) behavior
npm run start:vanilla

# CancelablePromise behavior
npm run start:canc
```

## What you'll see

Vanilla output shows: all losers complete (wasted work). Canc output shows: loser cancel counts, matching the abort markers. For allSettled, both settle all inputs (no cancel). For isolation, bubble:false keeps input alive despite siblings.

## Honesty notes

Cancellation stops at the JavaScript promise chain. The underlying API calls (mock delays here) may or may not be abortable; this example logs when cancellation handlers fire, proving the promise layer properly propagated the cancel.

## src/lib

(No library code in this example — all scenarios are direct imports.)
