# app-vue-pinia

Multi-step checkout wizard: address validation, shipping quote, payment review. Step navigation
cancels the abandoned step's in-flight calls.

Domain: a user proceeds through a checkout wizard one step at a time. Switching steps (address →
shipping → review or back) should not let stale responses from abandoned steps overwrite state
that the UI has already moved past.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a npm `file:`.
Build the monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
npm run build
cd examples
npm install
```

## Run

```
npm run dev:vanilla --workspace=app-vue-pinia
npm run dev:canc --workspace=app-vue-pinia
npm run start:vanilla --workspace=app-vue-pinia # production build + preview
npm run start:canc --workspace=app-vue-pinia
npm run test --workspace=app-vue-pinia
```

Open the printed preview URL, fill in an address, click Continue, then navigate back to address
while the shipping quote is still loading (check the browser dev tools Network tab to see the
timing).

## Wizard navigation semantics

Both stores expose the same shape: `step`, `validateAddress`, `quoteShipping`, `prepareReview`,
`goToStep`. The difference is what happens to a call the user abandons by navigating away.

- **canc.** The store keeps the in-flight load of each step: `addressLoad`, `shippingLoad`,
 `reviewLoad` (all `CancelablePromise<void> | null`). When `goToStep(next)` is called,
 it cancels the abandoned step's load before switching: `this.addressLoad?.cancel()`, one line
 per step. Only the surviving run ever writes state, so the UI always reflects the current step's
 actual data. `dispose()` (called on store cleanup) cancels any outstanding work the same way.
- **vanilla.** Plain promises cannot be interrupted, so the store falls back to the standard
 workaround: a request-id counter per step, bumped at the start of every action call, and every
 `.then` callback checks `if (id !== this.stepReqId) return` before writing state. The request
 still completes on the wire; only the state write is skipped. `goToStep` cannot stop anything
 already in flight either, it just bumps the relevant counter. `dispose()` bumps all counters.

## Rollback on cancel

The canc store demonstrates **one** instance of a pattern worth seeing: `quoteShippingOptimistic`
shows how to handle an optimistic UI update that must be rolled back when the user navigates away.

In the canc version:
```typescript
const load = quoteShippingCall(this.address.addressId).then((shipping) => {
 this.shipping = shipping;
 this.shippingStatus = 'done';
});
load.catch((err) => {
 if (!isCancelError(err)) return;
 // Rollback the optimistic placeholder when canceled
 this.shipping = null;
 this.shippingStatus = 'idle';
});
```

In the vanilla version, there is no cancel signal to rollback from (an optimistic placeholder can
only be corrected after the real response lands, or the UI remains in a misleading state until
the user navigates again). This is the bloat the example illustrates.

## Cancel in the store, not in the component

The step components (`AddressStep.vue`, `ShippingStep.vue`, `ReviewStep.vue`) are dumb and
identical between flavors: they read store state and dispatch actions. The router's
`beforeEach` hook wires URL navigation to `store.goToStep(step)`. All cancellation policy
lives in the store, where it can be tested and reasoned about without mounting components.

## Files to diff

- `src/stores/checkout-vanilla.ts` vs `src/stores/checkout-canc.ts`: the store. This is the
 payload; everything else is shared plumbing.
- `src/steps/AddressStep.vue`, `src/steps/ShippingStep.vue`, `src/steps/ReviewStep.vue`:
 identical, thin components. All policy lives in the store.
- `src/main-vanilla.ts` / `src/main-canc.ts`: entry points, differ only in which store module
 they import and provide.
- `src/router.ts`: shared router with step names and `beforeEach` hook.
- `src/mock/checkout-api.ts` is shared scaffolding wrapping `@shared/mock-api`'s checkout
 domain — pretend this is your API client.

## What it shows

- **Step navigation semantics.** Validate an address, then click Continue before validation
 settles: the canc store cancels the validate call, so no stale result overwrites the empty
 address state. The vanilla store lets the request finish anyway (its result is just
 discarded); both validate requests still hit the mock API.
- **One cancel call per step, not request-id counters.** The canc store has no request-id
 bookkeeping. One `addressLoad?.cancel()` call is enough, because cancel reaches the signal a
 `cancelify`'d call wires up internally.
- **Dispose cleanup.** When the pinia store is disposed (e.g., on app unmount), the canc
 version cancels every step still outstanding in one `dispose()` call.
- **Rollback on cancel.** `quoteShippingOptimistic` shows how to react to a cancel event: undo
 an optimistic UI update when the user navigates away before the real response arrives. The
 vanilla version has no cancel signal, so the optimistic state either persists as incorrect, or
 the UI must check request-id staleness every time a response arrives (more bookkeeping).

## Honesty note

Cancellation stops at the `AbortSignal` passed to the mock API. The `@shared/mock-api` service
(pretending to be a real HTTP API) honors `AbortSignal` and rejects with `AbortError`. A real
async service (e.g., a database query or a computation in progress) might not respond immediately
to `AbortSignal` if it does not check it mid-operation — the pattern still holds, but the
"cancellation" reaches only the async boundary, not the underlying work. See `src/mock/checkout-api.ts`
for what the API layer sees.

## Copying

The store pattern (one `CancelablePromise` field per in-flight action per step, cancel it
before starting the next) is the reusable piece for any Pinia store with step or tab navigation
where each step has async work that should not leak into other steps. Catching `isCancelError`
to roll back an optimistic update is optional, but shown here as a teaching pattern.

`src/mock/checkout-api.ts` is scaffolding for this demo, not something to copy.
