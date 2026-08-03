# demo-async-dispose

Report generation with resource disposal: `await using` binds a CancelablePromise to a scope,
auto-canceling unfinished work when the scope exits (return, throw, or early-exit). Shows cleanup
ordering, shield survival, and disposal-after-settle semantics.

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
npm run start:vanilla --workspace=demo-async-dispose
npm run start:canc --workspace=demo-async-dispose
npm run test --workspace=demo-async-dispose
```

Both entries run four scenarios: happy path, error thrown mid-scope, early return, and a
shielded audit write that survives cancellation of the report it belongs to.

## What canc buys here

A `CancelablePromise` already implements `[Symbol.asyncDispose]`: canceling on scope exit needs
no extra code. The vanilla twin has to hand-attach the same protocol on every code path, and gets
one detail wrong for free if you are not careful: a plain `Promise` has no way to mark its own
rejection handled, so disposing one that nobody else awaits becomes an unhandled rejection and
crashes the process. The vanilla twin here works around it with an explicit
`await promise.catch(() => {})` inside dispose. `CancelablePromise` suppresses that unhandled
rejection internally the moment it is canceled, so the canc twin needs nothing extra.

The shielded audit write shows the same asymmetry. `report-canc.ts` builds it as its own
`CancelablePromise` with `{ shield: true }` and chains it with `.finally()`: the shield is a
constructor option, not something wired by hand. `report-vanilla.ts` gets the same result only by
remembering to leave one particular API call unwired to the abort controller, an easy detail to
lose during a refactor.

## Diff guide

- `src/report-vanilla.ts` vs `src/report-canc.ts`: vanilla threads an `AbortController` by hand
 and hand-attaches `[Symbol.asyncDispose]`, including the manual catch that keeps it from
 crashing on an unawaited rejection. canc builds two `cancelify` wrappers and a `canc.async`
 coroutine; disposal comes from the returned `CancelablePromise` for free.
- `src/main-vanilla.ts` vs `src/main-canc.ts`: both use `await using`, but vanilla's version only
 works because of the wiring in `report-vanilla.ts`; canc's works because every
 `CancelablePromise` carries it.

## Notes

**Async disposal and `await using` require Node >=24 and TypeScript >=5.6.**

- **Cancellation reaches the network.** Both versions log abort markers in the mock API,
 proving dispose actually cancels the underlying call in flight, not just the local promise.
- **Cleanup ordering.** The canc entry demonstrates `await using` waiting for cancel handlers to
 settle before continuing (verified in smoke tests).
- **Dispose-after-settle.** If the report already settled (happy path), `cancel()` is a no-op;
 dispose costs nothing.
- **Shielded audit write.** One scenario cancels the report mid-fetch while a shielded audit
 write keeps running underneath. The audit write is built as an independent shielded
 `CancelablePromise`, not as a step yielded inside the coroutine's own cleanup, so its
 completion never depends on racing the canceled step's own timing.
