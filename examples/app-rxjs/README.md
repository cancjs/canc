# app-rxjs

RxJS interop for canc, shown in a live log viewer.

## What it shows

A log tail arrives as an RxJS stream. Clicking a tail line kicks off a context search (fetching
the lines around it), which is promise-based work. Clicking a second line before the first search
returns should abandon the first search. This is the spot where RxJS and promises meet, and where
cancellation is easy to lose.

`switchMap` unsubscribes the previous inner Observable when a new value arrives. That is enough
when the inner work is itself an Observable. It is not enough when the inner work is a promise:
unsubscribing stops the emission but the promise keeps running to completion in the background.
The result is discarded, but the work happened anyway. That is the boundary loss.

The two flavors differ only in how the search is plugged into `switchMap`:

- vanilla wraps the search promise with `from(promise)`. Switching away unsubscribes, but the
 promise runs to the end. Both searches complete.
- canc wraps a cancelable-promise factory with `fromCancelablePromise(factory)`. Switching away
 unsubscribes, and unsubscribe cancels the promise, which aborts the search. The first search is
 aborted, the second completes.

Each search records `started`/`completed`/`aborted` markers, so the difference is visible in the
output: two `completed` for vanilla, one `aborted` plus one `completed` for canc.

## Interop functions

`src/lib/canc-rxjs.ts` is a seed for a future `@cancjs/rxjs` package. It has no dependency on this
example, so copy it into your own project freely and adapt it.

- `toCancelablePromise(observable)` takes the first value of a stream as a CancelablePromise.
 `cancel()` unsubscribes the source, so its teardown runs. If the stream completes without ever
 emitting, the promise rejects with RxJS `EmptyError`, matching `firstValueFrom`. An empty stream
 is not treated as a cancellation.
- `fromCancelablePromise(factory)` wraps a cancelable-promise factory as an Observable. Unsubscribing
 before the promise settles cancels it, so its cancel handlers run and the underlying work
 aborts. This is the symmetric partner of `toCancelablePromise`: there, cancel unsubscribes;
 here, unsubscribe cancels.

## Run

Build the packages once from the monorepo root (`yarn build`), then install here (`yarn` in the
`examples/` root).

- `yarn start:vanilla` runs the leaking flavor.
- `yarn start:canc` runs the canceling flavor.
- `yarn test` runs the smoke suite.
- `yarn typecheck` typechecks both flavors.

## Files to diff

`src/search-vanilla.ts` against `src/search-canc.ts`. They share names, order, and structure; the
only mechanical difference is `from(promise)` versus `fromCancelablePromise(factory)` and the canc
flavor's `cancelify`-wrapped search call.

## Note on scope

The context search is signal-aware, so cancellation reaches the simulated request boundary and it
stops. A real logging backend would need to honor the abort the same way for the cancel to have
teeth. The interop layer only guarantees that unsubscribe reaches your promise as a cancel; what
your promise does with that cancel is up to the work it wraps.

`src/mock/` is example scaffolding standing in for a logging backend. It is not meant to be copied.
