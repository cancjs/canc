# demo-async-iter — Async Iterator Operators and Cancellation

Reconciliation of transactions over an async stream, comparing vanilla `for await` loops with
`@cancjs/toolbox/async-iter` pipe operators. The canc twin shows how canceling a pipeline
propagates `return()` back to the source, stopping it mid-stream.

## What it teaches

1. **Pipe composition.** `asyncIter.pipe(source, filter(...), map(...), toArray())` builds a
   lazy async pipeline equivalent to chained `for await` loops.
2. **Cancel forwarding.** Canceling the driving coroutine calls `return()` on every operator
   in the chain, all the way to the source generator. The source's `finally` block runs.
3. **Three consume forms.** Wrapper (`from(src).pipe(terminal)`), free
   (`pipe(src, ops, terminal)`), standalone (`terminal(pred)(pipe(src))`).
4. **Generator callbacks.** A generator-fn callback inside an operator (e.g. `map(function* ...)`)
   makes the per-item body cancelable: its `yield* canc.await(...)` steps are cancel points.
   An async-fn callback's `await` is native and NOT cancelable (the tradeoff is the same as
   `cancForAwait`).
5. **Break via `cancForAwait`.** Returning `false` from a generator callback stops the stream,
   like `break` in a `for await` loop but with external cancel support.
6. **`take(n)`.** Stops pulling after n items and closes the source.

## Files to diff

| Vanilla | Canc | What to look for |
|---------|------|------------------|
| `reconciliation-vanilla.ts` | `reconciliation-canc.ts` | for-await loops vs pipe expressions |
| `main-vanilla.ts` | `main-canc.ts` | no cancel scenario vs cancel mid-pipeline |

Note: the `canc` files showcase a cancel-mid-pipeline scenario and a take-operator pipeline (the `topPositiveIds` export) that have no direct structural counterpart on the vanilla side because vanilla async iteration lacks a mechanism to abort or compositionally close in-flight streams from the outside.

Shared helpers live in `reconciliation-shared.ts`. The mock data source is in `mock/transactions.ts`.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a npm `file:`.
Build the monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
npm run build
cd examples
npm install
```

## Running

```bash
npm run start:vanilla
npm run start:canc
npm test
```

## Honesty note

Cancellation stops the pipeline at the next `yield*` boundary. An item already being processed
by an async callback completes (the `await` inside the callback is native, not cancelable). A
generator-fn callback's `yield* canc.await(...)` steps are genuine cancel points. The source
generator's `finally` block always runs on cancellation.
