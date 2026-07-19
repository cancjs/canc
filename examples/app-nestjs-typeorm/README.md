# app-nestjs-typeorm

An invoicing SaaS API on NestJS and TypeORM. It shows request-scoped cancellation: when a client
disconnects, an interceptor cancels the in-flight request, and a bulk invoice-generation endpoint
rolls its transaction back in a shielded finally instead of committing work for a socket nobody is
reading.

## Domain

Customers and invoices over a TypeORM DataSource on better-sqlite3 (in memory). The heavy endpoint
generates one invoice per customer in a single transaction, split into chunks so it is long enough
to cancel mid-run.

## What it shows

- **Request-scoped cancellation interceptor.** Each handler returns its cancelable service call and
 leaves the same promise on the request. A `NestInterceptor` reads that promise when the client
 disconnects and cancels it, so the controller chain stops instead of finishing work for a dead
 socket. The handler calls no interceptor plumbing of its own. Nest awaits the returned cancelable
 promise unchanged, because a `CancelablePromise` is a native `Promise` subclass.
- **Decorators that coexist.** The decorated `InvoiceService` carries Nest's `@Injectable` and a
 custom `@BillingTier` marker (a `SetMetadata` decorator) on the same methods that canc's
 `@AsyncMethod` wraps. A guard reads the marker at request time, which proves canc's wrapper
 preserves the metadata Nest attached to the method.
- **Two service flavors, same behavior.** The decorated service and a no-decorator twin
 (`InvoiceServiceManual`, explicit `cancAsync` wiring) both satisfy the same contract. The canc
 module switches between them with `CANC_MANUAL=1`, so you can read the decorated and the explicit
 wiring side by side.
- **Transaction plus shield.** Bulk generation runs the chunks inside one TypeORM transaction.
 Cancel mid-batch and the coroutine's finally rolls the transaction back. canc runs that finally
 SHIELDED, so a second cancel can never abort the rollback half-done. The invoice count is left
 exactly where it started.

## Run both flavors

Build the canc packages first (the example consumes their built output):

```
# from the monorepo root
npm run build
# then, in this examples root
npm install
```

Then from this directory:

```
npm run start:canc # cancels mid-bulk, rolls back, count unchanged
CANC_MANUAL=1 npm run start:canc # same, using the no-decorator service
npm run start:vanilla # no cancellation: the full bulk run commits
```

Each entry boots the app, starts a bulk generation, destroys the client socket partway through, and
prints the invoice count before and after. canc leaves it unchanged; vanilla shows the full jump.

## Files to diff

The teaching payload lives in `-vanilla` / `-canc` twins. Read them side by side:

- `cancel.interceptor-vanilla.ts` vs `cancel.interceptor-canc.ts` (the passthrough vs the disconnect cancel)
- `invoice.service-vanilla.ts` vs `invoice.service-canc.ts` (plain async vs decorated coroutine)
- `invoice.controller-vanilla.ts` vs `invoice.controller-canc.ts`
- `app.module-vanilla.ts` vs `app.module-canc.ts`

`invoice.service-manual-canc.ts` is the no-decorator twin of the decorated service (canc side only).
Suffix-free modules (`invoice-repo.ts`, `billing-metadata.ts`, `invoice.tokens.ts`, `mock/db.ts`,
`scenario.ts`) are shared by both flavors.

## Honesty notes

Cancellation here is chain-level, not statement-level. better-sqlite3 runs every statement
synchronously on the calling thread, so nothing can abort a statement that is already executing.
What cancellation buys is stopping BETWEEN chunks: the coroutine stops at its current chunk
boundary, the remaining chunks never run, and the surrounding transaction rolls back what it had
written. A production Postgres driver could go further and issue a wire-level cancel of an in-flight
statement.

For a unit-level alternative that mocks the repository entirely (no real database), see
[mock-typeorm](https://www.npmjs.com/package/mock-typeorm); the DataSource in `mock/db.ts` is aux
scaffolding, not something to copy.
