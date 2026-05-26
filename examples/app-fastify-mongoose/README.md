# app-fastify-mongoose

Hotel availability search on Fastify and Mongoose. When the client drops the connection, the
server stops working on the request instead of running every database query for a socket nobody
is listening to.

## What it shows

- A route handler written as a `cancAsync` generator, wrapped with `cancAsyncRoute`
 (`src/lib/cancelable-route.ts`). The `close` event on the raw request cancels the handler's
 coroutine; the handler still owns `reply.send` and full control of the response.
- A cancelable repository boundary (`src/mock/db.ts`): the three queries (find rooms, load their
 nightly rates, aggregate occupancy) are wrapped with `cancelify` into canc-native fns, so the
 service awaits them with no signal threading.
- A three-step query chain built with `cancAsync` / `cancAwait` over that boundary. Cancellation is
 ambient, so no step needs a manual disconnect check.
- The vanilla twin runs the identical chain with plain promises. A disconnect cannot stop it, so
 every query still runs and the result is built for a client that already left.

## Domain

Travel booking. A search checks one hotel on one date: which rooms exist, what they cost, and how
full they already are.

## How to run

### Prerequisites

Build the monorepo first so `packages/*/dist` exists:

```bash
cd ../.. # monorepo root
yarn build
```

Then install this example's dependencies:

```bash
cd examples/app-fastify-mongoose
yarn install
```

### Both flavors

Each entry boots a Fastify server, fires one request, and destroys the socket mid-search:

```bash
yarn start:vanilla # every query runs for the dead socket
yarn start:canc # the chain stops, later queries are skipped
```

The canc run reports the skipped queries; the vanilla run reports the queries it still ran.

### Typecheck and tests

```bash
yarn typecheck
yarn test
```

## Files to compare

Use `diff` or a side-by-side viewer:

```bash
diff src/availability-service-vanilla.ts src/availability-service-canc.ts
diff src/main-vanilla.ts src/main-canc.ts
```

The service twins align step for step. The only differences are `await` becoming
`yield* cancAwait` inside a `cancAsync` generator, and the comment at each step changing from
"this always runs" to "canceled here, this is skipped". The route handlers differ by the
`cancAsyncRoute` wrapper, which exists only on the canc side.

## Honesty notes

Cancellation here works at the chain level. It stops the handler between queries: once a query has
been sent to MongoDB, Mongoose cannot recall it, so canc does not kill a running statement. What it
does is skip every query that has not started yet and discard the partial result, which is what
frees the server from finishing work for a client that has gone. This is the same story as the
express-kysely example on a different stack.

Mongoose does not expose an AbortSignal on a query, so the cancelified repository wrappers in
`src/mock/db.ts` do not forward a signal to the driver. They add chain-level cancellation only. If
you need the database itself to stop mid-statement, that is a driver-level concern outside this
example.

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

`src/lib/cancelable-route.ts` wraps a generator route handler as a `cancAsync` coroutine and
cancels it on client disconnect. It has no example-specific dependencies; copy it into an app that
needs the same wiring.
