# demo-toolbox

Learn how cancellation transforms common async patterns: pollers stop polling, retries stop backoffing and in-flight attempts, delays clear timers, signals propagate.

## What this shows

Six scenarios demonstrating how CancelablePromise improves control over async work compared to vanilla promises or AbortController threading alone:

1. **Deployment poller** (waitFor): Cancel stops polling immediately. Vanilla keeps calling the API.
2. **Payment retry loop**: Cancel mid-backoff clears the timer AND cancels the in-flight attempt. Vanilla still charges.
3. **Inventory timeout**: Canceling the timeout cancels the underlying API call (vs. Promise.race leaving it running).
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
- Canc cleanup: `handleCancel()` clears timers, cancels child promises
- Canc error handling: just `catch` (normal promise semantics)

## Testing

Specs use Jest fake timers to assert:
- Canceled delay promise has 0 pending timers (jest.getTimerCount())
- Canceled retry loop doesn't retry
- Canceled poller makes no more mock API calls

## Notes

All promises in the canc flavor return a `CancelablePromise<T>`, a native `Promise<T>` subclass. Vanilla returns `Promise<T>`. Both are awaitable and type-compatible at the call site.

## Honesty note

Cancellation in these toolbox utilities operates at the promise and timer layer:
- **waitFor (poller):** Clears the polling interval timer and cancels the current pending status request.
- **retry (backoff):** Clears the backoff delay timer and cancels the current active attempt's promise.
- **delay / timeout:** Clears the underlying timer (`setTimeout`) and cancels the wrapped execution promise.
However, cancellation cannot undo side effects (like database mutations or external API calls) that have already completed on the server before the cancel event was received.
