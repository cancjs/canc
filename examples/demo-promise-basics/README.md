# demo-promise-basics

User profile fetch: vanilla promise without cancellation, AbortController workaround, and
CancelablePromise. Teaches the core mechanics—resolvers, cancelHandlers, CancelError, `await
cancel()` ordering—via side-by-side code.

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

The canc entry shows one function:
- `loadProfile`: CancelablePromise; one `cancel()` call, no threading, result discarded via
 `handleCancel` wiring the abort signal. Rejection caught by ordinary `try/catch`.

## Diff guide

- `src/profile-service-vanilla.ts` vs `src/profile-service-canc.ts`: same function order, blank
 lines, and comment anchor positions (e.g., `// cancellation is just a rejection — regular
 catch works`).
- `src/main-vanilla.ts` vs `src/main-canc.ts`: identical console narrative showing the
 uncancelable → workaround → built-in progression.

## Notes

- **Cancellation reaches the network:** the mock API logs `aborted` markers proving cancel
 actually stopped the underlying call.
- **await cancel():** the canc entry demonstrates awaiting `cancel()` after calling it,
 proving handlers settle and cancellation state is observable.
- This is a pilot; its exact anatomy (files, functions, comments, outputs) serves as the
 reference for all later examples. Verify mechanics with `yarn examples:test` from the
 examples root.
