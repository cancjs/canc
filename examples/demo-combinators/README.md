# demo-combinators

Demonstrates cancellation behavior across Promise combinators (`all`, `any`, `race`, `allSettled`) compared to native JavaScript Promise.

## Domain

Dashboard bootstrap: four parallel widget requests (orders list, inventory check, stock price quote, deployment status). When one fails or settles early, what happens to the remaining pending requests?

## What this shows

In real applications, dashboard initialization fires multiple independent or interdependent requests in parallel. With native `Promise`, settling a combinator early (`all` on first reject, `race` on first settle, `any` on first fulfill) leaves losing requests running in the background, consuming bandwidth and server resources.

With `CancelablePromise` and `@cancjs/coroutine`:
- `canc.await.all`: When one promise rejects, all remaining pending inputs are automatically canceled (loser-cancel).
- `canc.await.any`: On the first fulfillment, all remaining pending inputs are canceled.
- `canc.await.race`: On the first settlement (fulfillment or rejection), all remaining pending inputs are canceled.
- `canc.await.allSettled`: Waits for every input to settle; no loser-cancel by definition.
- `bubble: false` isolation: Setting `promise.bubble = false` isolates an input from sibling cancellations so it survives when sibling requests fail.

## Files to compare

- `src/all-vanilla.ts` vs `src/all-canc.ts`: `Promise.all` keeps remaining requests running; `CancelablePromise.all` cancels them.
- `src/any-vanilla.ts` vs `src/any-canc.ts`: `Promise.any` leaves losers running; `CancelablePromise.any` cancels them.
- `src/race-vanilla.ts` vs `src/race-canc.ts`: `Promise.race` leaves losers running; `CancelablePromise.race` cancels them.
- `src/all-settled-vanilla.ts` vs `src/all-settled-canc.ts`: `allSettled` waits for all inputs; no cancellation in either flavor.
- `src/isolation-vanilla.ts` vs `src/isolation-canc.ts`: manual flag checks in vanilla vs `bubble: false` option in canc.

## Running

Build the monorepo packages first:
```bash
npm run build
```

Then run the example entries from `examples/`:
```bash
# Vanilla (native Promise) behavior
npm run start:vanilla --prefix demo-combinators

# CancelablePromise behavior
npm run start:canc --prefix demo-combinators
```

Or from within `examples/demo-combinators/`:
```bash
npm run start:vanilla
npm run start:canc
npm test
```

## What you see in the output

- **Vanilla**: Loser requests continue running to completion (wasted network and compute).
- **CancelablePromise**: Loser requests receive cancel signals immediately and transition to aborted status.
- **allSettled**: All inputs settle independently with zero aborted calls.
- **isolation**: The `bubble: false` widget completes while its failed siblings are canceled.

## Honesty notes

Cancellation occurs at the JavaScript promise and `AbortSignal` boundary. The simulated API endpoints in this example listen to the signal created by `cancelify` and abort their in-flight timers. In a production app, the underlying transport (e.g. `fetch` or `http.request`) must support `AbortSignal` to stop the in-flight network I/O.
