# app-angular

Admin dashboard: an orders table beside a detail pane. Selecting a row loads its details, selecting another row supersedes that load, and leaving the page ends whatever is still in flight. Domain: e-commerce orders admin.

Three flavors of the same dashboard, so the comparison is between real alternatives rather than between cancellation and nothing:

- **canc**: the load is a `CancelablePromise` held by a small resource helper. Superseding cancels, destroy cancels.
- **vanilla**: the load is a plain promise. Superseding drops the response, destroy drops nothing, both requests run to the end.
- **obs**: the load is an `Observable`, superseded with `switchMap` and ended with `takeUntilDestroyed`. It aborts for real, at the cost of turning the component into a pipeline.

## Prerequisites

The example consumes the built `dist` of `@cancjs/promise`, `@cancjs/coroutine`, `@cancjs/toolbox` and `@cancjs/decorators` through npm `file:` paths. Build the monorepo first, then install this workspace:

```
cd ../../ # monorepo root (canc)
npm run build
cd examples
npm install
```

## Run

Each flavor is its own Angular CLI configuration and dev server:

```
npm run start:canc --workspace=app-angular # runs ng serve -c canc
npm run start:vanilla --workspace=app-angular # runs ng serve -c vanilla
npm run start:obs --workspace=app-angular # runs ng serve -c obs
npm run test --workspace=app-angular
npm run typecheck --workspace=app-angular
```

`start:*` are aliases of the `dev:*` scripts, and `build:*` builds the same configurations. Open the browser console to watch the mock API log which requests start, complete, and abort.

## The resource helpers

`src/lib/cancelable-resource.ts` and `src/lib/promise-resource.ts` are the payload of the example. A resource holds one load: `status`, `value`, `error`, plus `run(promise)` and `reset()`. A component starts a load and reads three fields; everything else is inside the helper.

- `cancelableResource<T>()` takes the component's `DestroyRef` and cancels: `run` cancels the load it supersedes, `reset` cancels the pending one, destroy cancels whatever is left. A canceled run goes back to `idle`, because a cancellation is not an error the user should see.
- `promiseResource<T>()` is the same surface with the only tool a plain promise offers, a request-id compare. It drops stale responses. The requests behind them keep running, and it has no destroy hook at all, because there would be nothing for it to do. That gap is the lesson.

Both are written to be copied straight into your own project. `cancelable-resource.ts` is the seed of a future `@cancjs/angular` package.

Angular 19 ships a `resource()` primitive with the same vocabulary (`value`, `error`, `status`). This is the same idea for an app still on 18, backed by a cancelable promise.

## What each flavor does

- **canc**: `orders.service-canc.ts` puts `@AsyncMethod` (the TS-legacy decorator entry from `@cancjs/decorators/legacy`) on generator methods, so each returns a `CancelablePromise`. `orders.service-manual-canc.ts` shows the same coroutines wired by hand, without a canc decorator. Each mock API call is wrapped with toolbox `cancelify`, which turns a signal-aware function into a cancelable one with no hand-built promise machinery.
- **vanilla**: `orders.service-vanilla.ts` is plain async methods with nothing to cancel. The components carry the staleness workaround through `promiseResource`.
- **obs**: `orders.service-obs.ts` starts the request inside the `Observable` and aborts it in the teardown, which is how Angular's own `HttpClient` behaves. The `-obs` components subscribe to it directly.

The Observable service also feeds the canc components. `app.config-canc.ts` carries a three-way flavor switch, and its `observable` setting provides `ORDERS_SERVICE` from `OrdersServiceObservable` wrapped with `toCancelablePromise`. Cancel becomes unsubscribe becomes abort, and not one component changes.

## canc against RxJS, honestly

RxJS is not the naive side of this comparison. Both really abort the request. The difference is what each asks of your code.

For the unmount, RxJS wins on ceremony: `takeUntilDestroyed()` is one operator, and the async pipe already unsubscribes for you. `orders-table.component-obs.ts` needs no lifecycle hook at all.

For superseding a request, the answers diverge. `switchMap` cancels the previous inner subscription, but only if the request is already an observable in a pipe, so the component has to be restructured around the stream: the input becomes a `Subject`, the loading and loaded states become one view object emitted by the pipeline, and an error ends the stream unless you add `catchError`. Compare `detail-pane.component-obs.ts` with `detail-pane.component-canc.ts`: the canc side keeps the imperative shape (a lifecycle hook, an `if`, one call) and cancels the promise it is already holding.

So the choice is a matter of style and of what the rest of your app already looks like, not of capability. In a codebase that is promises end to end, canc gets the abort without a stream; in a codebase that is streams end to end, RxJS gets it without a promise. The two meet at `to-cancelable-promise.ts` whenever you need both.

## Files to diff

The twins line up, so a plain `diff` shows only the mechanics:

- `src/app/detail-pane.component-vanilla.ts` vs `src/app/detail-pane.component-canc.ts` (supersede and destroy)
- `src/app/orders-table.component-vanilla.ts` vs `src/app/orders-table.component-canc.ts` (one load, canceled on destroy)
- `src/lib/promise-resource.ts` vs `src/lib/cancelable-resource.ts` (the helper behind both)
- `src/app/orders.service-vanilla.ts` vs `src/app/orders.service-canc.ts` (decorator flavor)
- `src/app/orders.service-vanilla.ts` vs `src/app/orders.service-manual-canc.ts` (non-decorator flavor)
- `src/app/detail-pane.component-obs.ts` vs `src/app/detail-pane.component-canc.ts` (the RxJS comparison above)

## Copy the bridge

`src/lib/to-cancelable-promise.ts` bridges an RxJS `Observable` (an Angular `HttpClient` request, for instance) to a `CancelablePromise`. It subscribes directly rather than going through `firstValueFrom`, because the cancel handler needs the subscription itself: canceling the promise unsubscribes, and for an `HttpClient` request that unsubscribe is what aborts the XHR. It is written to be copied straight into your own project.

## Notes

- **Angular's own decorators:** Angular's `@Component`, `@Injectable` and the rest are untouched. `@AsyncMethod` only wraps specific service methods. No framework conflicts.
- **TypeScript decorator flavor:** Angular CLI 18.x still generates `experimentalDecorators: true` in `tsconfig.json`, so this example uses the TS-legacy decorator entry from `@cancjs/decorators/legacy`. If a future Angular CLI drops `experimentalDecorators`, switch the import to the default `@cancjs/decorators` entry (stage-3 flavor); all other code stays the same.
- **What cancellation stops here:** the orders requests are simulated by the shared mock API, which honors `AbortSignal`. Canceling a chain aborts the in-flight request at that boundary (an `aborted` marker in the call log). A real backend needs its own request to be abortable (an HTTP client that forwards an abort signal) for the cancel to reach the wire.
- `src/mock/` is scaffolding. Pretend it is your API. It is not meant to be copied.
