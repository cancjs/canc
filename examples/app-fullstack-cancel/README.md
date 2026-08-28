# app-fullstack-cancel

Cancellation that travels from a browser click to a database query. A user searches, then cancels
(or types the next keystroke, or navigates away). The HTTP request aborts, the express route cancels,
and the database stops getting queries. Nothing keeps running for a client that has left.

Stack: a React client using cancelable axios, an express route, and MikroORM 7.1 over PGlite
(Postgres in WASM, no server to run). Swap PGlite for real Postgres and the same code gains true
server-side query cancellation, no edits required.

Each layer ships in two flavors so you can read them side by side: `-canc` (the canc way) and
`-vanilla` (the same thing built by hand with an AbortController threaded through every layer). Both
run, both cancel. The diff is the lesson.

## Prerequisites

The example consumes the built `dist` of each `@cancjs/*` package through an npm `file:`. Build the
monorepo first, then install this workspace:

```
cd ../../          # monorepo root (canc)
npm run build
cd examples
npm install
```

## Run

```
npm run start:canc --workspace=app-fullstack-cancel      # express (canc) on :3000
npm run start:vanilla --workspace=app-fullstack-cancel   # express (vanilla) on :3000
npm run dev:canc --workspace=app-fullstack-cancel        # server + React client (canc)
npm run dev:vanilla --workspace=app-fullstack-cancel     # server + React client (vanilla)

npm run test --workspace=app-fullstack-cancel            # all tests
npm run test:e2e --workspace=app-fullstack-cancel        # full stack, both flavors, cancel reaches the DB
npm run test:client --workspace=app-fullstack-cancel     # the React client under jsdom
npm run typecheck --workspace=app-fullstack-cancel
```

Type a search and click away, or keep typing. The server stops issuing queries at the point you
canceled.

## What the canc side shows

The point is that route handlers never touch a signal. One middleware wires per-request cancellation
into the ORM, and the handler reads like ordinary code.

- `getRequestSignal` (`@cancjs/server-express`) gives each request an `AbortSignal`. Express does not
  provide one, so the package fills the gap: a handle created on first use and cached, aborted when
  the client disconnects with a `CancelError` reason so the rejection reads as a cancellation.
- `server/lib/orm-req-context-canc.ts` is the middleware (`ormReqContext`). It forks a request-scoped
  `EntityManager` bound to that signal and publishes it through MikroORM's `RequestContext`, so every
  query in the request cancels together. `getReqEm()` (in `server/lib/get-req-em.ts`) hands the
  handler that fork.
- `cancelableHandler` (`@cancjs/server-express`) wraps a generator handler as a coroutine and cancels
  it when the client disconnects. Each `yield*` step is a cancellation point.

The middleware and the route wrapper share one signal rather than wiring a listener each: the first
caller installs it, everyone after gets the cached one. So a disconnect cancels the coroutine and the
ORM fork in a single step.

The search itself (`server/search-service-canc.ts`) is a coroutine: find matching users, then enrich
each hit with a per-city count. A cancel stops the loop between statements, so the remaining rows are
never queried.

### The handler stays signal-free

Avoid threading the request signal by hand (and note that `req.signal` does not even exist on
express):

```ts
app.get('/api/search', cancelableHandler(function* (req, res) {
  const fork = orm.em.fork({ signal: req.signal, inflightQueryAbortStrategy: 'cancel query' });
  const hits = yield* canc.await(fork.find(User, whereMatch(q)));
  res.json(hits);
}));
```

Prefer one middleware, then a handler with no fork and no signal in sight:

```ts
app.use(ormReqContext(orm, { inflightQueryAbortStrategy }));

app.get('/api/search', cancelableHandler(function* (req, res) {
  const em = getReqEm();                              // request fork, signal already bound
  const hits = yield* canc.await(searchUsers(em, q));
  res.json(hits);
}));
```

For MikroORM the request fork is the only request-scoped thing a handler needs: it carries both the
isolated identity map and the cancellation signal. Capture it at the top of the handler, before the
first await, while the async context is live; its signal stays wired for every query no matter when
it runs. Code that is not ORM-aware and needs the raw signal deep in a call stack can still read
`getRequestSignal(req, res)`; there is no need for a separate async-context library, since MikroORM
already provides the one that matters.

## Files to diff

The `-vanilla` twin does exactly the same job with a hand-threaded AbortController, so the diff shows
what canc removes.

- `server/search-service-vanilla.ts` vs `server/search-service-canc.ts`: the search, with a drilled
  signal and manual `throwIfAborted` between statements versus an ambient coroutine.
- `server/routes-vanilla.ts` vs `server/routes-canc.ts`: reading the signal back, threading it into
  the service and checking it before responding, versus a signal-free generator route.
- `server/lib/orm-req-context-vanilla.ts` vs `server/lib/orm-req-context-canc.ts`: the same
  RequestContext middleware, binding the same request signal to the fork. Only the source of the
  signal differs, so this pair is nearly identical on purpose: binding a signal to the fork is a
  MikroORM feature and the vanilla side gets it too. The cost shows up one layer down.
- `server/lib/get-req-signal-vanilla.ts` has no `-canc` twin left to diff against. It stays
  hand-rolled on purpose, because that is what writing this yourself costs; the canc side is now
  `getRequestSignal` from `@cancjs/server-express`, which is the same idea with the disconnect guard
  and the per-request caching already in it.
- `client/SearchPage-vanilla.tsx` vs `client/SearchPage-canc.tsx`: an AbortController plus a
  request-id staleness guard versus a CancelablePromise that cancels the previous search.
- `client/api-vanilla.ts` vs `client/api-canc.ts`: a signal argument on every call versus a
  cancelable request.

## Drop-in Postgres

By default the server runs in-memory PGlite, so there is nothing to install or start. Point it at a
real Postgres and it wire-cancels running queries, with no code change:

```
cross-env PG_DB_URL=postgres://user:password@host:5432/dbname npm run start:canc
```

When `PG_DB_URL` is set the server uses `@mikro-orm/postgresql` and the `cancel query` strategy;
otherwise it uses `@mikro-orm/pglite` and `ignore query`. The tests cover the PGlite path only.

## Honesty notes

PGlite runs Postgres in one WASM thread. It cannot interrupt a statement that is already running, and
while a statement runs the thread is busy, so a disconnect is only noticed at a boundary between
statements. Both flavors yield to the event loop between statements for exactly this reason (real
Postgres, being async, does not need the yield). That boundary is the real unit of cancellation here:
the remaining queries never run and the response is released.

What each backend stops when the client cancels:

- Remaining queries skipped, socket released: PGlite yes, Postgres yes.
- The in-flight await rejects at a statement boundary: PGlite yes, Postgres yes.
- A running statement killed on the server: PGlite no (single thread, no cancel channel), Postgres
  yes, through `cancel query` which issues `pg_cancel_backend`.

Never read this example as PGlite killing a running query. The wire-level cancel is the payoff of the
Postgres swap.

## The client is one skin

`client/` is React, kept minimal on purpose: the cancellation logic is a few lines in the API layer
and the component. Typing runs through the toolbox `debounce`; canceling it stops the pending wait or
the in-flight request in one call. The vanilla twin hand-rolls the same behavior with a single
AbortController (`client/SearchPage-vanilla.tsx`), which is a compact lesson in what the helper saves.
Any UI layer can sit on top. For the same idea in a larger React example, see `../app-react`.

## Files to copy

`server/lib/orm-req-context-canc.ts` and `server/lib/get-req-em.ts` are the reusable pieces on the
server; the request signal and the route wrapper they used to sit next to now ship as
`@cancjs/server-express`. `server/orm.ts` and the seed are scaffolding for this demo, not something
to copy.
