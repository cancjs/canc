// Decorator flavor of the orders service. Generator methods wrapped with @AsyncMethod become
// coroutines that return a CancelablePromise, so a component can cancel an in-flight load and the
// abort reaches the fake network.
//
// Angular's CLI still generates `experimentalDecorators: true` (verified in this example's
// tsconfig.json), so this uses the TS-legacy decorator entry `@cancjs/decorators/legacy`
// (re-exported here as LegacyAsyncMethod). If a future CLI drops experimentalDecorators, switch the
// import to the default `@cancjs/decorators` (stage-3) entry; nothing else changes.
//
// Angular's own @Injectable decorator is untouched. Ours only wraps the data methods.

import { Injectable, inject } from '@angular/core';
import { LegacyAsyncMethod } from '@cancjs/decorators';
import { await as cancAwait } from '@cancjs/coroutine';
import { CancelablePromise } from '@cancjs/promise';

import { ORDERS_API } from './orders.api';
import type { OrderSummary, OrderDetail } from './orders.types';

// Wrap a signal-aware API call as a CancelablePromise so a coroutine cancel() aborts the request.
function abortable<T>(run: (signal: AbortSignal) => Promise<T>): CancelablePromise<T> {
 return new CancelablePromise<T>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 run(controller.signal).then(resolve, reject);
 });
}

@Injectable()
export class OrdersService {
 private readonly api = inject(ORDERS_API);

 @LegacyAsyncMethod()
 *list(): Generator<unknown, OrderSummary[]> {
 return yield* cancAwait(abortable((signal) => this.api.listOrders(signal)));
 }

 @LegacyAsyncMethod()
 *detail(id: string): Generator<unknown, OrderDetail> {
 return yield* cancAwait(abortable((signal) => this.api.orderDetail(id, signal)));
 }
}
