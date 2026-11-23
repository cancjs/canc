# demo-toolbox

Learn how cancellation stops polling, retry backoff, pending network requests and delayed work. Compare the same native mock API with plain promises and manually managed AbortControllers.

## What this shows

Six scenarios demonstrating how CancelablePromise improves control over async work compared to vanilla promises or AbortController threading alone:

1. **Deployment poller** (waitFor): Cancel stops polling immediately. Vanilla keeps calling the API.
2. **Payment retry loop**: Cancel during backoff prevents another attempt; cancel during an active charge aborts the pending client request. Plain vanilla keeps working, while the manual vanilla alternative manages its own controller and retry timer.
3. **Inventory timeout**: A 500ms deadline aborts the pending signal-aware inventory request. Plain `Promise.race` only stops waiting. Vanilla can abort the same API call with an explicit `AbortController`.
4. **Email delay (undo window)**: Cancel clears the timer so the email never sends. Vanilla sends it anyway.
5. **Gateway with signal**: Combine CancelablePromise cancel() with external AbortSignal.
6. **Cleanup with suppress**: One declarative line to swallow cancellation errors in finally blocks.

## Domains used

- Deployment status API
- Payment processing (retries, backoff)
- Inventory / product data
- Email service (delayed send)
- Payment gateway (accepts signals)
- Payment record lifecycle

## Running

Requires built @cancjs/promise; run `npm run build` in the monorepo root first.

```bash
npm install
npm run start:vanilla # Plain promises: see the waste comments
npm run start:canc # CancelablePromise: cancellation just works
npm run test # Specs: timer count + abort markers
npm run typecheck # Both flavors must type-check
```

## Files to study

### Example code (teaching payload)
- `src/poll-deploy-vanilla.ts` / `src/poll-deploy-canc.ts`: poller pattern
- `src/retry-payment-vanilla.ts` / `src/retry-payment-canc.ts`: exponential backoff with cancellation
- `src/inventory-timeout-vanilla.ts` / `src/inventory-timeout-canc.ts`: timeout that cancels the underlying work
- `src/email-delay-vanilla.ts` / `src/email-delay-canc.ts`: timer cleanup
- `src/gateway-signal-vanilla.ts` / `src/gateway-signal-canc.ts`: signal propagation
- `src/suppress-vanilla.ts` / `src/suppress-canc.ts`: error suppression in cleanup

### Helper code (publishable-tidy, may copy)
None in this example; helpers are simple enough to inline.

### Scaffolding (don't copy)
- `@shared/mock-api`: fake network layer with abort tracking

## Diff workflow

Compare twins side-by-side to spot the delta: `diff src/poll-deploy-vanilla.ts src/poll-deploy-canc.ts`. Key differences:
- Vanilla comments on waste: `// keeps running`, `// result discarded`
- Canc cleanup: `cancelify` passes the cancellation signal to each native mock API request
- Canc error handling: just `catch` (normal promise semantics)

## Testing

Specs use Jest fake timers and actual MockApi call records to assert:
- A canceled delay has no pending timers
- An inventory timeout or active payment cancel marks native work `aborted`
- Plain vanilla requests complete after the client stops waiting
- A canceled retry backoff creates no next native request
- A canceled poller makes no more mock API calls

## Notes

All promises in the canc flavor return a `CancelablePromise<T>`, a native `Promise<T>` subclass. Vanilla returns `Promise<T>`. Both are awaitable and type-compatible at the call site.

## Honesty note

Canc's `cancelify` wrapper connects a pending native request to a cancellation signal. The inventory timeout aborts its in-flight check, and payment retry cancellation aborts its active charge. Stopping retry backoff is a separate guarantee: it prevents a future attempt from starting.

Plain `Promise.race` does not abort its losing request. The vanilla `fetchInventoryWithTimeoutAbortable` and `chargeWithRetryAbortable` functions show that native `AbortController` can also stop the same work, at the cost of manually wiring the signal, retry timer and cancellation state.

Aborting a client request does **not** reverse a payment already committed on a server. A completed charge needs a separate refund or reconciliation operation.
