# demo-async-dispose

Report generation with resource disposal: `await using` binds a CancelablePromise to a scope,
auto-canceling unfinished work when the scope exits (return, throw, or early-exit). Shows cleanup
ordering, shield survival, and disposal-after-settle semantics.

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
yarn workspace demo-async-dispose start:vanilla
yarn workspace demo-async-dispose start:canc
yarn workspace demo-async-dispose test
```

The vanilla entry shows manual cleanup with try/finally and AbortController threading. Every
early exit point needs explicit cleanup wiring.

The canc entry shows four scenarios:

- **Happy path:** report completes normally; dispose settles cleanly (silent no-op).
- **Error path:** report cancelled by error thrown in scope; dispose settles after cleanup.
- **Early return:** report cancelled by leaving scope without await; dispose waits for handlers.
- **Shielded task:** one child is shielded; survives scope exit; parent cancellation doesn't reach it.

## Diff guide

- `src/report-vanilla.ts` vs `src/report-canc.ts`: vanilla uses try/finally + AbortController;
 canc attaches `[Symbol.asyncDispose]` and cancels on scope exit.
- `src/main-vanilla.ts` vs `src/main-canc.ts`: vanilla threads controller manually and documents
 cleanup points; canc uses `await using`, which auto-manages disposal.

## Notes

**Async disposal and `await using` require Node ≥24 and TypeScript ≥5.6.**

- **Cancellation reaches the network:** both versions log abort markers in the mock API,
 proving dispose actually cancels underlying calls.
- **Cleanup ordering:** the canc entry demonstrates `await using` waiting for handlers to settle
 before continuing (verified in smoke tests).
- **Dispose-after-settle:** if the report already settled (happy path), `cancel()` is a no-op;
 dispose costs nothing.
- **Shielded tasks:** one scenario shows `report.shield()` creating a child that survives the
 scope exit. The shielded task is independent; canceling the parent does not reach it.
