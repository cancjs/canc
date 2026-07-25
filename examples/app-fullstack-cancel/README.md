# app-fullstack-cancel

Cancellation that travels from a browser click to a database query. A user searches, then cancels
(or navigates away). The HTTP request aborts, the express route cancels, and the database stops
getting queries. Nothing keeps running for a client that has left.

Stack: a plain-TS client using cancelable axios, an express route written as a cancelable coroutine,
and MikroORM 7.1 over PGlite (Postgres in WASM, no server to run). Swap PGlite for real Postgres and
the same code gains true server-side query cancellation, no edits required.

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
npm run dev --workspace=app-fullstack-cancel          # server + client together
npm run dev:server --workspace=app-fullstack-cancel   # express on :3000
npm run dev:client --workspace=app-fullstack-cancel   # vite on :5180, proxies /api

npm run test --workspace=app-fullstack-cancel         # all tests
npm run test:e2e --workspace=app-fullstack-cancel     # full stack, client cancel reaches the DB
npm run test:client --workspace=app-fullstack-cancel  # the UI under jsdom
npm run typecheck --workspace=app-fullstack-cancel
```

Open the client, type a search, and click Cancel while it runs. The server logs stop issuing queries
at the point you canceled.

## What it shows

The whole point is that route handlers never touch a signal. One middleware wires per-request
cancellation into the ORM, and the handler reads like ordinary code.

- `server/lib/req-signal.ts` gives each request an `AbortSignal`. Express does not provide one, so
  this fills the gap: a lazily created controller, stored under a namespaced key, aborted when the
  client disconnects with a `CancelError` reason so the rejection reads as a cancellation.
- `server/lib/canc-request-context.ts` is the middleware. It forks a request-scoped `EntityManager`
  bound to that signal and publishes it through MikroORM's own `RequestContext`, so every query in
  the request cancels together. This is what removes the manual fork from every handler.
- `server/lib/cancelable-route.ts` wraps a generator handler as a `cancAsync` coroutine and cancels
  it when the client disconnects. Each `yield* cancAwait(...)` is a cancellation point.

The search itself (`server/search-service.ts`) is a coroutine: find matching users, then enrich each
hit with a per-city count. A cancel stops the loop between statements, so the remaining rows are
never queried.

### The handler stays signal-free

Avoid threading the request signal by hand (and note that `req.signal` does not even exist on
express):

```ts
app.get('/api/search', cancAsyncRoute(function* (req, res) {
  const fork = orm.em.fork({ signal: req.signal, inflightQueryAbortStrategy: 'cancel query' });
  const hits = yield* cancAwait(fork.find(User, whereMatch(q)));
  res.json(hits);
}));
```

Prefer one middleware, then a handler with no fork and no signal in sight:

```ts
app.use(cancRequestContext(orm, { inflightQueryAbortStrategy }));

app.get('/api/search', cancAsyncRoute(function* (req, res) {
  const em = requestEm();                             // request fork, signal already bound
  const hits = yield* cancAwait(searchUsers(em, q));
  res.json(hits);
}));
```

For MikroORM the request fork is the only request-scoped thing a handler needs: it carries both the
isolated identity map and the cancellation signal. Because the fork is captured as an object, its
signal stays wired for every query no matter when it runs, even after the async context has moved on.
Code that is not ORM-aware and needs the raw signal deep in a call stack can still read
`reqSignal(req, res)` directly; there is no need for a separate async-context library here, since
MikroORM already provides the one that matters.

## Drop-in Postgres

By default the server runs in-memory PGlite, so there is nothing to install or start. Point it at a
real Postgres and it wire-cancels running queries, with no code change:

```
cross-env PG_DB_URL=postgres://user:password@host:5432/dbname npm run dev:server
```

When `PG_DB_URL` is set the server uses `@mikro-orm/postgresql` and the `cancel query` strategy;
otherwise it uses `@mikro-orm/pglite` and `ignore query`. The tests cover the PGlite path only.

## Honesty notes

PGlite runs Postgres in one WASM thread. It cannot interrupt a statement that is already running, and
while a statement runs the thread is busy, so a disconnect is only noticed at a boundary between
statements. That boundary is the real, meaningful unit of cancellation here: the remaining queries
never run and the response is released.

What each backend stops when the client cancels:

- Remaining queries skipped, socket released: PGlite yes, Postgres yes.
- The in-flight await rejects at a statement boundary: PGlite yes, Postgres yes.
- A running statement killed on the server: PGlite no (single thread, no cancel channel), Postgres
  yes, through `cancel query` which issues `pg_cancel_backend`.

Never read this example as PGlite killing a running query. The wire-level cancel is the payoff of the
Postgres swap.

## The client is just one skin

`client/` is plain TypeScript on purpose. The cancellation logic lives in the API layer
(`client/api.ts`, `client/lib/debounce.ts`) and the DOM wiring is a thin view. Any UI layer can sit
on top. For the same logic in a React component, see the `../app-react` example. The `debounce`
helper is a cancelable debounce prototyped on the toolbox `delay`; it is a good candidate to graduate
into `@cancjs/toolbox`.

## Files to copy

`server/lib/req-signal.ts`, `server/lib/canc-request-context.ts`, and `server/lib/cancelable-route.ts`
are the reusable pieces. `server/orm.ts` and the seed are scaffolding for this demo, not something to
copy.
