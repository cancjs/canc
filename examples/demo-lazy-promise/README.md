# LazyPromise: Config Fetch with Zero Start Delay

## What It Shows

LazyPromise defers execution until the first consumer subscribes. Multiple consumers share a single execution, and cancellation can prevent execution if it happens before subscription.

**Scenarios:**
- **Lazy-start**: No executor call until first `.then()` or `await`
- **Shared consumers**: N subscribers = 1 executor run (result cached)
- **Cancel-before-start**: Cancel before subscription prevents executor entirely
- **Reset cycle**: With `resettable: true`, all consumers cancel before settle → executor re-runs on next subscription

## Domain

Feature-flag config fetch shared by multiple widgets. Before LazyPromise, you would:
- Memoize the promise manually (`let cached = null`)
- Have no way to abort mid-fetch when all consumers disconnect
- Have no reset mechanism without manual cache-buster code

With LazyPromise: executor = fetch, teardown = abort, reset = re-fetch on all-cancel.

## Running

```bash
# Install (from examples/ root)
npm install

# Vanilla baseline (memoized-thunk, no cancel)
npm run start:vanilla

# Canc flavor (LazyPromise, cancellable)
npm run start:canc

# Tests
npm run test

# Type check both
npm run typecheck
```

## Files to Diff

See the side-by-side diff of `flags-vanilla.ts` vs `flags-canc.ts`:

```bash
diff src/flags-vanilla.ts src/flags-canc.ts
```

Both modules export `Flags` interface and fetch functions with the same names, aligned for comparison.

## Vanilla Footguns (Highlighted in Code)

1. **No way to un-fetch when nobody needs it anymore** — cached promise stays forever
2. **No reset without manual cache-buster** — `resetFlagsCache()` is a workaround function

## Canc Advantages

1. Cancel before start → executor never runs
2. Automatic teardown on cancel (e.g., abort pending request)
3. Resettable mode: all consumers cancel → reset to unstarted, next subscriber re-fetches

## Honesty Notes

Cancellation stops executor-level work only (fetch call, network). If the fetch already reached the server, that work persists; the server saw the request. The teardown callback gives you a hook to abort the request (if your API supports it), but the server-side effect is out of scope.

## Helper Code

No extractable helpers in this example — `flags-*.ts` is domain-specific. The `LazyPromise` class (from `@cancjs/lazy-promise`) is the reusable pattern; you can copy its usage style freely.

## Versions Pinned

All deps use exact versions (no `^` or `~`):
- `@cancjs/promise`, `@cancjs/lazy-promise` linked to local builds
- Node/jest/TS toolchain pinned per `package.json`
