# app-express-kysely

E-commerce back office. A slow orders report endpoint runs a chain of kysely queries over a
seeded in-memory Postgres-compatible database (pglite). When the client disconnects, the canc version cancels the
handler chain so the remaining work never runs. The vanilla version keeps computing for a socket
nobody is reading.

Domain: an operator opens an orders report, then closes the tab before it finishes.

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
npm run start:vanilla --workspace=app-express-kysely
npm run start:canc --workspace=app-express-kysely
npm run test --workspace=app-express-kysely
```

Each entry boots the server, starts an orders report, destroys the client socket partway through,
and prints how many aggregate slices ran afterwards. The canc run freezes the query log at the
disconnect point; the vanilla run finishes every slice.
To run the opt-in wire-cancel path, run `DATABASE_URL=... npm run start:canc` connecting to a real Postgres database.

## What it shows

- `cancelableHandler` (`@cancjs/server-express`, canc) wraps a generator route handler as a
  `canc.async` coroutine and cancels it when the client disconnects. The handler keeps the normal
  `(req, res, next)` shape and owns the response; the wrapper only adds the cancellation wiring.
- `executeCancelable` (`src/lib/cancelable-kysely.ts`, canc) integrates cancellation INTO kysely via one reusable helper. The app code stays signal-free.
- `buildReport` (canc) is a `canc.async` coroutine: a page query, a per-customer totals query, then
  a slow grand-total aggregate split into slices. Each step is a `canc.await`, so cancellation is
  ambient. No signal is threaded through the handler.
- The vanilla twin carries both shapes: `buildReport` cannot be stopped at all, and
  `buildReportAbortable` is the hand-rolled AbortController version that threads `{ signal }` into every call and re-checks `signal.aborted`
  at every boundary. Compare the single canc coroutine against both.

## Files to diff

- `src/report-service-vanilla.ts` vs `src/report-service-canc.ts`: the report chain, with and
  without cancellation. The vanilla file adds a second `buildReportAbortable` function showing the
  manual-signal cost; the canc file needs no such second flavor.
- `src/middleware-vanilla.ts`: disconnect wiring for the abortable workaround, exposing an
  AbortSignal the handler threads by hand. It has no `-canc` twin on purpose: the canc flavor needs
  no middleware, because cancellation is wired per-route by `cancelableHandler`.
- `src/routes-vanilla.ts` vs `src/routes-canc.ts`: route handlers. Vanilla needs a second
  `/orders/report-abortable` route for the workaround; canc has one report route, written as a
  generator passed to `cancelableHandler`. Both files also serve `/products`. The canc one goes
  through `cancelableHandler` as well, so a disconnect cancels it, but a single short query leaves
  almost nothing to stop: the cancel only lands in time if it arrives before the statement is sent.
  The report route is where the difference is visible.

## Honesty matrix

| what stops | pglite (default, in-process WASM) | node-postgres `pg` (opt-in server) |
|---|---|---|
| remaining slices skipped, socket released | yes | yes |
| in-flight await rejects at a statement boundary | yes (async driver) | yes |
| a running statement killed server-side | **no** (thread blocked; no `cancelQuery`) | **yes** via `'cancel query'` -> `pg_cancel_backend` |
| session/backend killed | no | yes via `'kill session'` -> `pg_terminate_backend` |

Express exposes a `request.signal` on the incoming message, and it looks like the obvious hook for
disconnect detection. It is not: that signal aborts when the request stream ends, not when the
client disconnects, so on a route with a body parser it would fire before the handler even runs.
`cancelableHandler` avoids it and listens on the response instead, only treating a close event as a
disconnect while the response has not finished writing. `middleware-vanilla.ts`'s
`abortOnDisconnect` reaches for the identical `res.on('close')` plus `!res.writableEnded` guard, for
the same reason: the hand-rolled version already gets this right, it is not the naive side of this
comparison.

## Copying

`src/lib/cancelable-kysely.ts` is the reusable piece. The route wrapper it used to sit next to now
ships as `@cancjs/server-express`. `src/mock/` is scaffolding.

One limit worth knowing before copying: kysely takes a signal per query, not per transaction. So
`transactionCancelable` rejects its caller on cancel, and the transaction it opened still runs to the
end and commits. Canceling the queries inside the body is what stops a transaction, because kysely
rolls back when the body rejects. `src/lib/cancelable-kysely.spec.ts` asserts both halves of that.
