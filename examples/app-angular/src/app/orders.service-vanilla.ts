// Vanilla flavor of the orders service. Plain async methods, no cancelable chain to hand back. A
// detail load started here keeps running even after the component moved on to another row; the
// component has to guard against the stale result itself (see detail-pane.component-vanilla.ts).
//
// Angular's own @Injectable decorator is untouched. There is no canc decorator counterpart here.

import { inject, Injectable } from '@angular/core';

import { ORDERS_API } from './orders.api';
import type { OrderDetail, OrdersServiceShape, OrderSummary } from './orders.types';

// (no cancelable wrapper counterpart — see orders.service-canc.ts)

@Injectable()
export class OrdersService implements OrdersServiceShape {
  private readonly api = inject(ORDERS_API);

  async list(): Promise<OrderSummary[]> {
    return this.api.listOrders();
  }

  async detail(id: string): Promise<OrderDetail> {
    // No signal is threaded, so this request runs to completion even if the caller moved on.
    return this.api.orderDetail(id);
  }
}
