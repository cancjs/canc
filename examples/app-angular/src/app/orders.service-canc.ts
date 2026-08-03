// Decorator flavor of the orders service. Generator methods wrapped with @AsyncMethod become
// coroutines that return a CancelablePromise, so a component can cancel an in-flight load and the
// abort reaches the fake network.
//
// Angular's CLI still generates `experimentalDecorators: true` (verified in this example's
// tsconfig.json), so this uses the TS-legacy decorator entry `@cancjs/decorators/legacy`. If a
// future CLI drops experimentalDecorators, switch the import to the default `@cancjs/decorators`
// (stage-3) entry; nothing else changes.
//
// Angular's own @Injectable decorator is untouched. Ours only wraps the data methods.

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

  // Wrap each signal-aware API call as a CancelablePromise so a coroutine cancel() aborts the
  // request. getSignal() is only materialized if the underlying call reaches for it. The field
  // types are written out because an initializer that reads `this` cannot be inferred from itself.
  private readonly listOrders: () => CancelablePromise<OrderSummary[]> = cancelify(({ getSignal }) =>
    this.api.listOrders(getSignal()),
  );
  private readonly orderDetail: (id: string) => CancelablePromise<OrderDetail> = cancelify(
    ({ getSignal }, id: string) => this.api.orderDetail(id, getSignal()),
  );

  // A getter returning a coroutine, which is the form TypeScript reads correctly: the call site
  // sees the CancelablePromise the method really returns. The decorator memoizes it on first
  // access, so the identity is stable.
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
