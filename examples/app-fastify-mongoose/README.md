# app-fastify-mongoose

Hotel availability search on Fastify and Mongoose. When the client drops the connection, the
server stops working on the request instead of running every database query for a socket nobody
is listening to.

## What it shows

- A route handler written as a canc generator, wrapped with `cancAsyncRoute`
  (`src/lib/cancelable-route.ts`). The `close` event on the raw request cancels the handler's
  coroutine; the handler still owns `reply.send` and full control of the response.
- The cancelable boundary living in the service (`src/availability-service-canc.ts`), not in the
  data layer. `cancelify` turns the plain repository fns of `src/mock/db.ts` into canc-native ones,
  so the repository stays an ordinary Mongoose module that knows nothing about canc.
- A three-step chain built with `canc.async` / `canc.await` over that boundary: find the rooms,
  load their nightly rates, then scan the bookings for occupancy. Cancellation is ambient, so no
  step needs a manual disconnect check.
- Two disconnect scenarios. An early disconnect stops the chain between queries, so the later ones
  are never issued. A late one lands inside the booking scan, which then stops at the document it
  is on instead of walking the rest.
- The vanilla twin runs the identical chain with plain promises. A disconnect cannot stop it, so
  every query still runs, the scan walks every booking, and the result is built for a client that
  already left.

## Domain

Travel booking. A search checks one hotel on one date: which rooms exist, what they cost, and how
full they already are.

## How to run

### Prerequisites

Build the monorepo first so `packages/*/dist` exists:

```bash
cd ../..  # monorepo root
npm run build
```

Then install this example's dependencies:

```bash
cd examples/app-fastify-mongoose
npm install
```

### Both flavors

Each entry boots a Fastify server and plays both disconnect scenarios against it:

```bash
npm run start:vanilla  # every query runs, the scan walks all 40 bookings
npm run start:canc     # the chain stops, and the scan stops where it stands
```

Each run prints the queries it issued and how many booking documents the scan got through.

### Typecheck and tests

```bash
npm run typecheck
npm run test
```

## Files to compare

Use `diff` or a side-by-side viewer:

```bash
diff src/availability-service-vanilla.ts src/availability-service-canc.ts
diff src/main-vanilla.ts src/main-canc.ts
```

The service twins align step for step. The canc side opens with the `cancelify` boundary the
vanilla side has no use for, then every `await` becomes `yield* canc.await` inside a `canc.async`
generator, and the comment at each step changes from "this always runs" to "canceled here, this is
skipped". The route handlers differ by the `cancAsyncRoute` wrapper, which exists only on the canc
side. The repository (`src/mock/db.ts`) is shared by both flavors and is identical for each.

## Honesty notes

Cancellation here works at two layers, and they are not the same thing.

The chain level is the default and the one this example leans on. A canceled coroutine stops
between steps, so a query that has not started yet is never issued and the partial result is
discarded instead of being assembled for a dead socket. Nothing is killed on the database server.

The document scan is the second layer. Mongoose's `cursor.eachAsync` takes a `signal` option, and
that signal is a client-side loop stop. It stops pulling further batches and resolves. It does not
close the cursor, does not abort the operation already in flight, and does not reject. No
connection is dropped, which makes it the cheap and safe cancellation point, and it is the only
place this example spends a signal. `scanBookings` in `src/mock/db.ts` implements those same stop
semantics by hand, because mockingoose replaces the cursor with a stand-in that drops the options
argument. Every signal is inert through mockingoose, so the mock has to carry the behavior itself.

True statement-level cancellation does exist. Mongoose forwards an `AbortSignal` from the query
options straight to the driver, and the driver's cursor closes when that signal aborts, so the
operation really does stop on the server. That is the
[`Abortable`](https://mongodb.github.io/node-mongodb-native/7.0/types/Abortable.html) interface of
the MongoDB Node driver, version 7.2 here. The cost is
[NODE-6062](https://jira.mongodb.org/browse/NODE-6062): aborting this way makes the driver drop the
connection and open a new one. Under load, canceling every disconnected request that way turns
into connection churn, which is why it fits an explicit user cancel (someone clicking "stop" on a
slow report) better than ambient request cancellation.

So `ABORT_QUERIES` in `src/mock/db.ts` is off by default. Turning it on passes the signal the typed
way, `Model.find(filter, null, { signal })`, never through `setOptions`, which only carries a signal
through an index signature and is not typed for it. Through mockingoose the flag changes nothing
here, so treat it as a documented escape hatch rather than a feature of this example.

## Why plain vanilla, not a workaround

This example keeps the vanilla twin as plain uncancelable promises so the ambient cancellation of
the canc twin stands on its own. The manual-cancellation workaround (threading an `AbortController`,
checking a staleness flag between steps) and its bloat are shown in the express-kysely example.

## Mocking

The data layer runs against [mockingoose](https://www.npmjs.com/package/mockingoose), which
intercepts Mongoose model methods and returns canned documents, so no MongoDB server is needed.
mockingoose 3.0.0 declares Mongoose 9 as a peer dependency and worked against the pinned Mongoose
9.7.4 here, so the mongodb-memory-server fallback was not needed. The mock setup and seed data live
in `src/mock/db.ts` and `src/mock/models.ts`; treat them as a black box.

## Helper code

`src/lib/cancelable-route.ts` wraps a generator route handler as a coroutine and cancels it on
client disconnect. It has no example-specific dependencies; copy it into an app that needs the same
wiring.
