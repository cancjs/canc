// Manual (non-decorator) flavor of the orders service. Constructor wiring with cancAsync(gen, this)
// is the exact desugaring the @AsyncMethod decorator applies, so the same components get the same
// cancelable behavior with no decorator transform involved. Swapping the ORDERS_SERVICE provider
// between this and the decorator flavor shows both against the identical dashboard.
//
// Angular's own @Injectable decorator is untouched; there is no canc decorator here at all.

import { Injectable, inject } from '@angular/core';
import { async as cancAsync, await as cancAwait } from '@cancjs/coroutine';
import { CancelablePromise } from '@cancjs/promise';

import { ORDERS_API } from './orders.api';
import type { OrderSummary, OrderDetail, OrdersServiceShape } from './orders.types';

// Wrap a signal-aware API call as a CancelablePromise so a coroutine cancel() aborts the request.
function abortable<T>(run: (signal: AbortSignal) => Promise<T>): CancelablePromise<T> {
 return new CancelablePromise<T>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 run(controller.signal).then(resolve, reject);
 });
}

@Injectable()
export class OrdersServiceManual implements OrdersServiceShape {
 private readonly api = inject(ORDERS_API);

 constructor() {
 // Equivalent to @AsyncMethod(): wrap each generator method as a coroutine bound to this instance.
 this.list = cancAsync(this.listGen, this) as unknown as OrdersServiceManual['list'];
 this.detail = cancAsync(this.detailGen, this) as unknown as OrdersServiceManual['detail'];
 }

 list!: () => Promise<OrderSummary[]>;
 detail!: (id: string) => Promise<OrderDetail>;

 private *listGen(): Generator<unknown, OrderSummary[]> {
 return yield* cancAwait(abortable((signal) => this.api.listOrders(signal)));
 }

 private *detailGen(id: string): Generator<unknown, OrderDetail> {
 return yield* cancAwait(abortable((signal) => this.api.orderDetail(id, signal)));
 }
}
