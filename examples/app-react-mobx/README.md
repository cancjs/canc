# app-react-mobx

A crypto/stock watchlist portfolio. Clicking a symbol loads its quote and price history. Switching
symbols (or refreshing) should cancel the previous symbol's in-flight requests. This example
contrasts what mobx cancels on its own with what canc cancels.

Domain: a watchlist where only the currently selected symbol matters. Any request for a symbol you
navigated away from is wasted work.

## Shallow vs deep cancel

mobx has its own cancellation for `flow`: run a flow, keep the handle, and call
`flowResult(run).cancel()`. This is the best mobx offers out of the box, and it is a **shallow**
cancel. It stops the generator, but any request the generator already started keeps running to
completion. Switch from BTC to ETH mid-load and the BTC quote still lands on the server; its result
is simply thrown away.

`cancFlow` (in `src/lib/canc-flow.ts`) is a **deep** cancel. It returns a `CancelablePromise` whose
`cancel()` propagates through the coroutine: the pending request is aborted at the network and no
downstream step runs, so no stale state is written for an abandoned symbol. It also returns the
typed result directly, so there is no `flowResult` wrapper to unwrap.

Run both headless and compare the last lines:

```
yarn start:vanilla # BTC quote completes after the switch (wasted work)
yarn start:canc # BTC requests aborted after the switch, only ETH is written
```

The browser app shows the same behavior interactively:

```
yarn dev:vanilla
yarn dev:canc
```

## Files to diff

The teaching payload is the store twin. Same file names, same export, same structure; only the
cancellation mechanics differ.

- `src/portfolio-store-vanilla.ts` vs `src/portfolio-store-canc.ts`
- `src/Watchlist-vanilla.tsx` vs `src/Watchlist-canc.tsx` (identical modulo the store import)

Supporting code:

- `src/lib/canc-flow.ts` — the cancFlow helper (see below).
- `src/mock/market-api.ts` — a fake quotes feed. Pretend this is your API. It records
 started/completed/aborted so the demo can prove a cancel reached an in-flight request.

## cancFlow

`src/lib/canc-flow.ts` is a small, dependency-tidy helper: a cancelable replacement for mobx `flow`,
built on `@cancjs/coroutine`. It is a seed for a future `@cancjs/mobx` package, so extracting it is a
file move. Copy it freely.

The only mobx-specific concern it handles is strict mode. This example runs under
`configure({ enforceActions: 'always' })`, so every observable write must be inside an `action`.
mobx's own `flow` gets this for free; cancFlow supplies the same guarantee by wrapping each
generator re-entry (next / throw / return) in a mobx `action` before it reaches the coroutine
driver. Your code writes observables freely between yields with no strict-mode warnings. The smoke
test fails on any `[MobX]` warning to keep this honest.

## Three store flavors

The default store (`portfolio-store-canc.ts`) uses `makeAutoObservable`. Two more flavors under
`src/flavors/` show the same behavior with different declaration styles:

- `store-standard.ts` — mobx stage-3 decorators (`@observable accessor`, `@action`) plus a canc
 stage-3 `@AsyncMethod` loader. Native TS 5 decorators.
- `flavors/legacy/store-legacy.ts` — legacy decorators for both libraries, compiled with its own
 tsconfig (`experimentalDecorators: true`).

```
yarn start:canc # auto (makeAutoObservable)
yarn start:canc:standard # stage-3 decorators
yarn start:canc:legacy # legacy decorators
```

The auto-observable flavor has one trap worth calling out. `makeAutoObservable` infers a generator
method as a mobx `flow`. But `loadSymbol` here is a cancFlow, not a mobx flow, so it must be
annotated `action` explicitly (`makeAutoObservable(this, { loadSymbol: action })`). Leave it to
inference and mobx wraps it as a flow, and its driver fights the cancFlow driver. The store comments
mark this.

## Honesty note

Cancellation here reaches the request layer: the abort fires an `AbortSignal` that the market feed
honors, so an in-flight quote or history request is dropped, not just ignored. A real feed over
`fetch` behaves the same way (fetch takes a signal). If your data source cannot be aborted at the
transport, cancellation still stops your chain (no downstream steps, no stale writes) but cannot
un-send a request already on the wire.
