# app-react

Flight destination search in React. A typeahead where every keystroke starts a new search, plus
a per-row hover that prefetches flight details. Domain: travel search.

This is the classic stale-response race. Type fast and several searches are in flight at once; the
last one to come back wins, but an earlier, slower response can arrive after it and overwrite the
results the user is looking at. The `-canc` flavor fixes it by cancellation: each keystroke cancels
the previous search chain, hover cancels the prefetch on unhover, and unmount cancels whatever is
still pending. Cancellation is not "ignore the result" here. The mock API logs an `aborted` marker,
proving the request was really stopped.

## Prerequisites

The example consumes the built `dist` of `@cancjs/promise` through a yarn `link:`. Build the
monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
yarn build
cd examples
yarn
```

## Run

Two flavors, each its own Vite dev server and HTML entry:

```
yarn workspace app-react dev:canc # canc.html + src/main-canc.tsx
yarn workspace app-react dev:vanilla # vanilla.html + src/main-vanilla.tsx
yarn workspace app-react test
yarn workspace app-react typecheck
```

`start:canc` / `start:vanilla` are aliases of the `dev:*` scripts. Open the browser console to
watch the mock API log which requests start, complete, and abort.

## What each flavor does

- **canc**: `SearchPage-canc.tsx` runs each search through `useCancelable`, one hook that starts a
 `CancelablePromise` per keystroke, cancels the superseded one, and returns its settlement as
 render state. `FlightRow-canc.tsx` does the same for the hover details, and adds a fire-and-forget
 warm-cache prefetch through `useCancelableEffect` to show the low-level effect-only case (a run to
 cancel on cleanup, no state to render). A canceled run is treated as "nothing to show" rather than
 an error.
- **vanilla**: `SearchPage-vanilla.tsx` is the hand-rolled workaround: an `AbortController` per
 effect, an `isMounted` ref to guard `setState`, and a request-id compare so a slow response
 cannot overwrite a newer one. `FlightRow-vanilla.tsx` is a plain fetch with no cancellation at
 all: an abandoned hover completes anyway and sets state on a row the user already left. The
 footgun comments mark each consequence.

## Files to diff

The side-by-side is the point. Same file names modulo the suffix, same function order and layout:

- `src/SearchPage-vanilla.tsx` vs `src/SearchPage-canc.tsx`
- `src/FlightRow-vanilla.tsx` vs `src/FlightRow-canc.tsx`

## Copy the hooks

`src/lib/` holds the React helpers this example prototypes. They carry no example-specific code and
are written to be lifted straight into your own project. Copy them freely. They are the seed of a
future `@cancjs/react` package.

- `useCancelable(factory, deps)`: fetch-on-dependency-change in one call. Runs the factory as a
 `CancelablePromise`, re-runs and cancels the previous run when `deps` change, cancels the last run
 on unmount, and returns `{ status, value, error }`. Reach for this first.
- `useCancelableEffect(callback, deps)`: the low-level effect-only primitive. Use it when you start
 a cancelable run but render nothing from it (fire-and-forget analytics or a warm-cache prefetch).
 Returning a `CancelablePromise` makes its `cancel()` the effect cleanup.
- `usePromiseState(promise)`: tracks one promise's settlement as render state, for manual control
 when you build the chain yourself. `useCancelable` composes it internally.
- `useCancelableCallback(factory)`: latest-wins imperative runner for event handlers, where each
 call cancels the previous still-pending one.

## Notes

- **What cancellation stops here:** the search and details requests are simulated by the shared
 mock API, which honors an `AbortSignal`. Canceling a chain aborts the in-flight request at that
 boundary (an `aborted` marker in the call log). A real backend needs its own request to be
 abortable (fetch with a signal, an HTTP client that forwards abort) for the cancel to reach the
 wire.
- `src/mock/` is scaffolding. Pretend it is your API. It is not meant to be copied.
