// vanilla flavor of orders service with plain async methods and no cancel chain

import { inject, Injectable } from '@angular/core';

import { ORDERS_API } from './orders.api';
import type { OrderDetail, OrdersServiceShape, OrderSummary } from './orders.types';

// (no cancellation counterpart, see -canc)

@Injectable()
export class OrdersService implements OrdersServiceShape {
  private readonly api = inject(ORDERS_API);

  async list(): Promise<OrderSummary[]> {
    return this.api.listOrders();
  }

  async detail(id: string): Promise<OrderDetail> {
    // request runs to completion with no signal threaded
    return this.api.orderDetail(id);
  }
}
