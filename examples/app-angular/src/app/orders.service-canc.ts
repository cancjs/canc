// decorator flavor of orders service wrapping methods with @AsyncMethod

import { inject, Injectable } from '@angular/core';
import * as canc from '@cancjs/coroutine';
import { AsyncMethod } from '@cancjs/decorators/legacy';
import type { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';

import { ORDERS_API } from './orders.api';
import type { CancelableOrdersService, OrderDetail, OrderSummary } from './orders.types';

@Injectable()
export class OrdersService implements CancelableOrdersService {
  private readonly api = inject(ORDERS_API);

  // cancelified API calls where cancel() aborts underlying request
  private readonly listOrders: () => CancelablePromise<OrderSummary[]> = cancelify(({ getSignal }) =>
    this.api.listOrders(getSignal()),
  );
  private readonly orderDetail: (id: string) => CancelablePromise<OrderDetail> = cancelify(
    ({ getSignal }, id: string) => this.api.orderDetail(id, getSignal()),
  );

  // memoized coroutine getter returning CancelablePromise
  @AsyncMethod()
  get list() {
    return canc.async(function* (this: OrdersService) {
      return yield* canc.await(this.listOrders());
    }, this);
  }

  @AsyncMethod()
  get detail() {
    return canc.async(function* (this: OrdersService, id: string) {
      return yield* canc.await(this.orderDetail(id));
    }, this);
  }
}
