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
import { AsyncResult, await as cancAwait } from '@cancjs/coroutine';
import { AsyncMethod } from '@cancjs/decorators/legacy';
import { cancelify } from '@cancjs/toolbox';

import { ORDERS_API } from './orders.api';
import type { OrderDetail, OrderSummary } from './orders.types';

@Injectable()
export class OrdersService {
  private readonly api = inject(ORDERS_API);

  // Wrap each signal-aware API call as a CancelablePromise so a coroutine cancel() aborts the
  // request. getSignal() is only materialized if the underlying call reaches for it.
  private readonly listOrders = cancelify(({ getSignal }) => this.api.listOrders(getSignal()));
  private readonly orderDetail = cancelify(({ getSignal }, [id]: [string]) => this.api.orderDetail(id, getSignal()));

  @AsyncMethod()
  *list(): AsyncResult<OrderSummary[]> {
    return yield* cancAwait(this.listOrders());
  }

  @AsyncMethod()
  *detail(id: string): AsyncResult<OrderDetail> {
    return yield* cancAwait(this.orderDetail(id));
  }
}
