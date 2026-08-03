// Manual (non-decorator) flavor of the orders service. The getters below are identical to the
// decorator flavor; the only difference is that the constructor does by hand what @AsyncMethod
// does for free. Swapping the ORDERS_SERVICE provider between this and the decorator flavor shows
// both against the identical dashboard.
//
// Angular's own @Injectable decorator is untouched; there is no canc decorator here at all.

import { inject, Injectable } from '@angular/core';
import * as canc from '@cancjs/coroutine';
import type { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';

import { ORDERS_API } from './orders.api';
import type { CancelableOrdersService, OrderDetail, OrderSummary } from './orders.types';

@Injectable()
export class OrdersServiceManual implements CancelableOrdersService {
  private readonly api = inject(ORDERS_API);

  // Wrap each signal-aware API call as a CancelablePromise so a coroutine cancel() aborts the
  // request. getSignal() is only materialized if the underlying call reaches for it. The field
  // types are written out because an initializer that reads `this` cannot be inferred from itself.
  private readonly listOrders: () => CancelablePromise<OrderSummary[]> = cancelify(({ getSignal }) =>
    this.api.listOrders(getSignal()),
  );
  private readonly orderDetail: (id: string) => CancelablePromise<OrderDetail> = cancelify(
    ({ getSignal }, [id]: [string]) => this.api.orderDetail(id, getSignal()),
  );

  constructor() {
    // What the decorator does on first access: read the getter once, bind it, and keep the result
    // as an own property. Without it a bare getter would build a fresh coroutine on every access.
    canc.asyncMethod(this, 'list');
    canc.asyncMethod(this, 'detail');
  }

  get list() {
    return canc.async(function* (this: OrdersServiceManual) {
      return yield* canc.await(this.listOrders());
    }, this);
  }

  get detail() {
    return canc.async(function* (this: OrdersServiceManual, id: string) {
      return yield* canc.await(this.orderDetail(id));
    }, this);
  }
}
