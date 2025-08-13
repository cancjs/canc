# demo-promise-basics

User profile fetch: vanilla promise without cancellation, AbortController workaround, and
CancelablePromise. Teaches the core mechanics (resolvers, cancel handlers, CancelError, `await
cancel()` ordering) and the two-way propagation an AbortController cannot express, via
side-by-side code.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a yarn `link:`.
Build the monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
yarn build
cd examples
yarn
```

## Run

```
yarn workspace demo-promise-basics start:vanilla
yarn workspace demo-promise-basics start:canc
yarn workspace demo-promise-basics test
```

The vanilla entry shows two functions:
- `loadProfile`: plain promise, result discarded after cancel but fetch completes (wasted work).
- `loadProfileAbortable`: AbortController threaded down, error checked for `.name === 'AbortError'`.

The canc entry shows one function, the twin of both vanilla functions above:
- `loadProfileCancelable`: CancelablePromise built with `cancelify`, one `cancel()` call, no
 threading, cancel signal wired automatically. Rejection caught by ordinary `try/catch`.

The canc entry runs three scenarios:
1. Cancel the load directly, catch a plain `CancelError`.
2. Cancel twice and `await` the second call, proving cancel handlers settle before it resolves.
3. Two consumers derive from one load and both cancel their own branch. Neither ever calls
 `cancel()` on the source, yet the source auto-cancels because every consumer lost interest
 (the bubble). A bare AbortController cannot express this: only the code holding the controller
 can call `abort()`, and it has no concept of "all my consumers walked away."

## Diff guide

- `src/profile-service-vanilla.ts` vs `src/profile-service-canc.ts`: same function order, blank
 lines, and comment anchor positions (e.g., `// cancellation is just a rejection, regular
 catch works`).
- `src/main-vanilla.ts` vs `src/main-canc.ts`: identical console narrative showing the
 uncancelable to workaround to built-in progression, then the canc-only bubble scenario (vanilla
 carries a placeholder comment at the aligned position instead).

## Notes

- **Cancellation reaches the network:** the mock API logs `aborted` markers proving cancel
 actually stopped the underlying call.
- **await cancel():** the canc entry demonstrates awaiting `cancel()` after calling it,
 proving handlers settle and cancellation state is observable.
- **Two-way propagation:** the third canc scenario cancels both consumers of a shared load and
 shows the source auto-canceling in response. Vanilla has no counterpart, only the source of
 truth for interest tracking would have to be built by hand.
- This is a pilot; its exact anatomy (files, functions, comments, outputs) serves as the
 reference for all later examples. Verify mechanics with `yarn examples:test` from the
 examples root.
