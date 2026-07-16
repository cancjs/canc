# app-react-suspense

Loading destination details under React Suspense, with cancellation of an abandoned load. Domain:
travel search. This is the Suspense sibling of `app-react`, which uses the non-Suspense
`usePromiseState` path instead.

Pick a destination and its details load under a Suspense fallback. Pick another before the first
finishes and the abandoned request should stop, not run to completion in the background. The `-canc`
flavor does exactly that: the abandoned request aborts (an `aborted` marker in the mock call log).
The `-vanilla` flavor cannot, so the abandoned request finishes anyway.

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

Two flavors, each its own Vite dev server and HTML entry:

```
yarn workspace app-react-suspense dev:canc # canc.html + src/main-canc.tsx
yarn workspace app-react-suspense dev:vanilla # vanilla.html + src/main-vanilla.tsx
yarn workspace app-react-suspense test
yarn workspace app-react-suspense typecheck
```

`start:canc` / `start:vanilla` are aliases of the `dev:*` scripts. Open the browser console to watch
the mock API log which detail requests start, complete, and abort.

## Why plain Suspense is not enough

`React.use(promise)` suspends the tree until the promise settles, which is what shows the fallback.
But a component that suspends on first render never commits, so its own effects never run. That
means the intuitive fix (create the resource in the reader and cancel it in the reader's cleanup
effect) does not work: when the reader is abandoned during the fallback, the cleanup that would
cancel it is never scheduled, and the request runs to completion.

Cancellation has to live in a component that commits. This example shows three panels:

- **`DetailPanel-canc.tsx` (correct).** The resource is created above the boundary, in
 `useCancelableResource`, and handed to a `CancelableSuspense` boundary. The boundary commits and
 stays mounted while the reader inside it suspends, so its cleanup effect runs when the resource is
 superseded or the boundary unmounts, and cancels the in-flight request.
- **`NaiveDetailPanel-canc.tsx` (the leak we teach).** The reader creates a `CancelablePromise` and
 tries to cancel it in its own cleanup effect (`useCancelableSuspense`). Because it suspends before
 it ever commits, that effect never runs, and the abandoned load completes anyway.
- **`DetailPanel-vanilla.tsx`.** A plain `use(api.destinationDetails(id))`. A plain Promise has no
 cancel, so the abandoned load always completes.

## Files to diff

- `src/DetailPanel-vanilla.tsx` vs `src/DetailPanel-canc.tsx`: the plain-Suspense panel vs the
 cancel-aware boundary.
- `src/NaiveDetailPanel-canc.tsx`: the in-child-cancel attempt that leaks. Read it next to
 `DetailPanel-canc.tsx` to see why the boundary, not the reader, has to own the cancel.

## Copy the lib

`src/lib/` holds the Suspense helpers this example prototypes. They carry no example-specific code
and are the seed of a future `@cancjs/react` package. Copy them freely.

- `useCancelableResource(factory, deps)`: render-as-you-fetch. Starts the request and returns a
 stable `CancelablePromise` (memoized per `deps`, which `React.use` requires) to hand to a
 boundary.
- `CancelableSuspense`: a Suspense boundary that cancels its resource on unmount or when a new
 resource supersedes it. Pass a resource from `useCancelableResource`; the render prop receives the
 resolved value.
- `useCancelableSuspense(factory, deps)`: the in-child hook kept only as the counter-example. It
 leaks; use `CancelableSuspense` instead.

## Notes

- **What cancellation stops here:** the details request is simulated by the shared mock API, which
 honors an `AbortSignal`. Canceling the resource aborts the in-flight request at that boundary (an
 `aborted` marker in the call log). A real backend needs its own request to be abortable (fetch
 with a signal) for the cancel to reach the wire.
- **React.use needs a stable promise.** A fresh promise on every render would suspend forever, so
 `useCancelableResource` memoizes it per `deps`. Cancel-on-abandon needs a committing owner (the
 boundary), not the suspending child.
- `src/mock/` is scaffolding. Pretend it is your API. It is not meant to be copied.
