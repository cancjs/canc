# app-angular

Admin dashboard — orders table + detail pane. Selecting a row loads its details; clicking another row cancels the previous detail load. Destroy (component unmount) cancels everything. Domain: e-commerce orders admin.

Two service implementations are shown side-by-side to teach the decorator and non-decorator cancellation flavors: both give the same `CancelablePromise` behavior through different routes (`@AsyncMethod` generator decorator vs explicit `cancAsync(gen, this)` constructor wiring).

## Prerequisites

The example consumes the built `dist` of `@cancjs/promise`, `@cancjs/coroutine`, and `@cancjs/decorators` through npm `file:` paths. Build the monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
npm run build
cd examples
npm install
```

## Run

Two flavors, each its own Angular CLI configuration and dev server:

```
npm run start:canc --workspace=app-angular # runs ng serve -c canc
npm run start:vanilla --workspace=app-angular # runs ng serve -c vanilla
npm run test --workspace=app-angular
npm run typecheck --workspace=app-angular
```

`start:canc` / `start:vanilla` are aliases of the `dev:*` scripts. Open the browser console to watch the mock API log which requests start, complete, and abort.

## What each flavor does

- **canc**: `orders.service-canc.ts` uses `@AsyncMethod` (TS-legacy decorator flavor from `@cancjs/decorators/legacy`) on generator methods. `orders.service-manual-canc.ts` shows the equivalent non-decorator path: explicit `cancAsync(gen, this)` wiring in the constructor. Both return `CancelablePromise`, so `detail-pane.component-canc.ts` can hold the promise and cancel it on row selection change or component destroy. Each mock API call is wrapped with toolbox `cancelify`, which wires `AbortSignal` cancellation without any hand-built promise machinery.
- **vanilla**: `orders.service-vanilla.ts` is plain async methods with no cancellation. `detail-pane.component-vanilla.ts` implements a request-id staleness guard to discard stale results — a manual workaround for the race. Switching the `ORDERS_SERVICE` DI token in the test shows both flavors against identical components.

## Files to diff

The service layer differences are the core lessons:

- `src/app/orders.service-vanilla.ts` vs `src/app/orders.service-canc.ts` (decorator flavor)
- `src/app/orders.service-vanilla.ts` vs `src/app/orders.service-manual-canc.ts` (non-decorator flavor)
- `src/app/detail-pane.component-vanilla.ts` vs `src/app/detail-pane.component-canc.ts` (component cancellation wiring)

## Copy the helper

`src/lib/to-cancelable-promise.ts` bridges Angular's `HttpClient` Observable to `CancelablePromise` using `firstValueFrom` + subscription teardown, proving two cancellation systems can cooperate. It is written to be copied straight into your own project. It is the seed of a future `@cancjs/angular` package.

## Notes

- **Angular's own decorators:** Angular's `@Component`, `@Injectable`, etc. are completely untouched. Our decorators (`@AsyncMethod`) only wrap specific service methods. No framework conflicts.
- **TypeScript decorator flavor:** Angular CLI 18.x still generates `experimentalDecorators: true` in `tsconfig.json`, so this example uses the TS-legacy decorator entry from `@cancjs/decorators/legacy`. If a future Angular CLI drops `experimentalDecorators`, switch the import to the default `@cancjs/decorators` entry (stage-3 flavor); all other code remains identical.
- **What cancellation stops here:** the orders requests are simulated by the shared mock API, which honors `AbortSignal`. Canceling a chain aborts the in-flight request at that boundary (an `aborted` marker in the call log). A real backend needs its own request to be abortable (an HTTP client that forwards abort for a signal) for the cancel to reach the wire.
- `src/mock/` is scaffolding. Pretend it is your API. It is not meant to be copied.
