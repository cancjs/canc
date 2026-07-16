# app-vue-suspense

Loading a product detail page under Vue `<Suspense>`, with cancellation of an abandoned load.
Domain: a product catalog. Open a product and its details load under a Suspense fallback. Open
another before the first finishes and the abandoned request should stop, not run to completion.

The `-canc` flavor cancels the abandoned load (an `aborted` marker in the mock call log). The
`-vanilla` flavor cannot, so the abandoned request finishes in the background.

## Prerequisites

The example consumes the built `dist` of each `@cancjs/*` package through a yarn `link:`. Build the
monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
yarn build
cd examples
yarn
```

## Run

```
yarn workspace app-vue-suspense dev:vanilla
yarn workspace app-vue-suspense dev:canc
yarn workspace app-vue-suspense start:vanilla # production build + preview
yarn workspace app-vue-suspense start:canc
yarn workspace app-vue-suspense test
```

Open the printed preview URL, open a product, then open another while the first is still loading.
Watch the browser console for the mock API abort log.

## The pattern

Vue drives `<Suspense>` from an async `setup()`: the fallback shows until setup resolves. Both
flavors use that, and differ only in what happens to the load when the component's scope tears down
before setup settles (opening another product remounts the detail component under the boundary).

- **`ProductDetail-canc.vue` (correct).** The `setup` option is a generator wrapped by
 `cancelableSetup`, which runs the awaited load as one cancelable coroutine and registers an
 `onScopeDispose` cancel. The setup body reads `yield* cancAwait(loadDetail(props.id))`, no signal
 in sight, because the API boundary is cancelified once at module scope. Tearing down the scope
 cancels the coroutine and aborts the request.
- **`ProductDetail-vanilla.vue`.** A plain `async setup()` with a bare `await`. There is no scope
 hook on the await, so the abandoned load runs to completion.

## Files to diff

- `src/ProductDetail-vanilla.vue` vs `src/ProductDetail-canc.vue`: the bare async setup vs the
 generator setup wrapped by `cancelableSetup`.

## Copy the lib

`src/lib/cancelable-setup.ts` is the seed of a future `@cancjs/vue` package. Copy it freely.

- `cancelableSetup(function* setup(props) { ... })`: wraps a generator setup function so its awaited
 work runs as one cancelable coroutine tied to the component's effect scope, canceled on scope
 teardown. Use it as the `setup` option.

## Honesty note

The setup-option wrapper is the opt-in. Vue's `<script setup>` runs its top-level `await` with no
scope hook to cancel, so it cannot host this pattern; a custom Vue Suspense loader that would patch
that is out of scope here. Use the `setup` option (as `ProductDetail-canc.vue` does) when you want
the in-flight load canceled on teardown.

Cancellation stops at the `AbortSignal` passed to the mock API, which honors it and rejects with an
`AbortError`. A real backend needs its own request to be abortable for the cancel to reach the wire.
`src/mock/catalog-api.ts` is scaffolding. Pretend it is your API. It is not meant to be copied.
