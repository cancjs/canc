// manual flavor of orders service binding coroutines in constructor

import { inject, Injectable } from '@angular/core';
import * as canc from '@cancjs/coroutine';
import type { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';

import { ORDERS_API } from './orders.api';
import type { CancelableOrdersService, OrderDetail, OrderSummary } from './orders.types';

@Injectable()
export class OrdersServiceManual implements CancelableOrdersService {
  private readonly api = inject(ORDERS_API);

  // cancelified API calls where cancel() aborts underlying request
  private readonly listOrders: () => CancelablePromise<OrderSummary[]> = cancelify(({ getSignal }) =>
    this.api.listOrders(getSignal()),
  );
  private readonly orderDetail: (id: string) => CancelablePromise<OrderDetail> = cancelify(
    ({ getSignal }, id: string) => this.api.orderDetail(id, getSignal()),
  );

  constructor() {
    // bind getter once to prevent constructing fresh coroutines on access
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
