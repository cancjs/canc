# app-vue

Marketplace product browser. A category filter change cancels the previous catalog load and all
pending per-product image prefetches. Leaving the page cancels everything still in flight.

This is the awaited-watch footgun. Vue's plain `watch()` does not wait for async work to finish,
so an older, slower response can outlive a newer trigger and overwrite the current state with
stale data. The `-canc` flavor fixes it with `useCancelableWatch`: when the source changes, the
previous run is canceled before the new one starts, and only the latest result affects the UI.
Cancellation is not "ignore the result" here. The mock API logs an `aborted` marker, proving the
request was really stopped.

## Prerequisites

The example consumes the built `dist` of `@cancjs/promise` through a npm `file:`. Build the
monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
npm run build
cd examples
npm install
```

## Run

Two flavors, each its own Vite dev server and HTML entry:

```
npm run start:canc --workspace=app-vue # canc.html + src/main-canc.ts
npm run start:vanilla --workspace=app-vue # vanilla.html + src/main-vanilla.ts
npm run dev:canc --workspace=app-vue # same, with HMR
npm run dev:vanilla --workspace=app-vue
npm run test --workspace=app-vue
npm run typecheck --workspace=app-vue
```

Open the browser console to watch the mock API log which catalog and image requests start,
complete, and abort.

## What each flavor does

- **canc**: `CatalogPage-canc.vue` uses `useCancelableWatch` to run the filter callback; when the
 filter changes, the previous load is canceled before the new one starts. `ProductCard-canc.vue`
 uses `useCancelablePromise` to run the image prefetch; the promise is canceled automatically
 when the card unmounts (via `onScopeDispose`).
- **vanilla**: `CatalogPage-vanilla.vue` is the hand-rolled workaround: an `AbortController` for
 the request plus a `stale` flag so a slow response for a past filter cannot clobber the current
 one. The watch cleanup function both aborts the request and sets the flag. `ProductCard-vanilla.vue`
 is a plain fetch with no cancellation at all: an unmounted card completes the prefetch anyway
 and discards the result. The footgun comments mark the consequence.

## Files to diff

The side-by-side is the point. Same file names modulo the suffix, same function order and layout:

- `src/CatalogPage-vanilla.vue` vs `src/CatalogPage-canc.vue`
- `src/ProductCard-vanilla.vue` vs `src/ProductCard-canc.vue`

## Copy the composables

`src/lib/` holds the Vue composables this example prototypes: `useCancelablePromise`,
`useCancelableWatch`. They carry no example-specific code and are written to be lifted straight
into your own project. Copy them freely. They are the seed of a future `@cancjs/vue` package.

## Notes

- **What cancellation stops here:** the catalog listing and image requests are simulated by the
 shared mock API, which honors an `AbortSignal`. Canceling a chain aborts the in-flight request
 at that boundary (an `aborted` marker in the call log). A real backend needs its own request to
 be abortable (fetch with a signal, an HTTP client that forwards abort) for the cancel to reach
 the wire.
- `src/mock/` is scaffolding. Pretend it is your API. It is not meant to be copied.
