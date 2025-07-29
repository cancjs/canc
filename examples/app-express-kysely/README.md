# app-express-kysely

E-commerce back office. A slow orders report endpoint runs a chain of kysely queries over a
seeded in-memory SQLite database. When the client disconnects, the canc version cancels the
handler chain so the remaining work never runs. The vanilla version keeps computing for a socket
nobody is reading.

Domain: an operator opens an orders report, then closes the tab before it finishes.

## Prerequisites

The examples consume the built `dist` of each `@cancjs/*` package through a yarn `link:`.
Build the monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
yarn build
cd examples
yarn
```

## Run

```
yarn workspace app-express-kysely start:vanilla
yarn workspace app-express-kysely start:canc
yarn workspace app-express-kysely test
```

Each entry boots the server, starts an orders report, destroys the client socket partway through,
and prints how many aggregate slices ran afterwards. The canc run freezes the query log at the
disconnect point; the vanilla run finishes every slice.

## What it shows

- `cancelOnDisconnect` middleware (canc) installs a per-request cancellation root. `req.on('close')`
 cancels the in-flight report, so the coroutine stops at its next step.
- `buildReport` (canc) is a `cancAsync` coroutine: a page query, a per-customer totals query, then
 a slow grand-total aggregate split into slices. Each step is a `cancAwait`, so cancellation is
 ambient. No signal is threaded through the handler.
- The vanilla twin carries both shapes: `buildReport` cannot be stopped at all, and
 `buildReportAbortable` is the hand-rolled AbortController version that re-checks `signal.aborted`
 at every boundary. Compare the single canc coroutine against both.

## Files to diff

- `src/report-service-vanilla.ts` vs `src/report-service-canc.ts`: the report chain, with and
 without cancellation. The vanilla file adds a second `buildReportAbortable` function showing the
 manual-signal cost; the canc file needs no such second flavor.
- `src/middleware-vanilla.ts` vs `src/middleware-canc.ts`: disconnect wiring. Vanilla exposes an
 AbortSignal the handler must thread by hand; canc exposes a `run` that cancels the op for you.
- `src/routes-vanilla.ts` vs `src/routes-canc.ts`: route handlers. Vanilla needs a second
 `/orders/report-abortable` route for the workaround; canc has one report route.

## Honesty notes

- **Cancellation stops the chain, not a running statement.** better-sqlite3 executes every query
 synchronously on the calling thread. Nothing here can abort a query that is already running.
 What cancellation does is stop BETWEEN queries: the grand-total aggregate is split into slices,
 and cancelling means the remaining slices never start and the response is released. That is the
 honest, meaningful unit of cancellation for a synchronous database.
- **Real databases can go further.** A Postgres driver can issue a wire-level cancel of an
 in-flight statement, killing work already running on the server. That is out of scope here (no
 external database to run), but the same middleware and coroutine structure applies: you would
 drive the driver's cancel from the same `req.on('close')`.

## Copying

`src/middleware-canc.ts` and the coroutine shape in `src/report-service-canc.ts` are the reusable
pieces. The `src/mock/` database is scaffolding for this demo, not something to copy.
