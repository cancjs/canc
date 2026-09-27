// observable flavor of orders service where unsubscribe aborts underlying request

import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ORDERS_API } from './orders.api';
import type { OrderDetail, OrderSummary } from './orders.types';

@Injectable()
export class OrdersServiceObservable {
  private readonly api = inject(ORDERS_API);

  list(): Observable<OrderSummary[]> {
    return this.request((signal) => this.api.listOrders(signal));
  }

  detail(id: string): Observable<OrderDetail> {
    return this.request((signal) => this.api.orderDetail(id, signal));
  }

  private request<T>(start: (signal: AbortSignal) => Promise<T>): Observable<T> {
    return new Observable<T>((subscriber) => {
      const controller = new AbortController();

      start(controller.signal).then(
        (value) => {
          if (subscriber.closed) return;
          subscriber.next(value);
          subscriber.complete();
        },
        (error: unknown) => {
          // abort rejects request when subscriber is already closed
          if (subscriber.closed) return;
          subscriber.error(error);
        },
      );

      // unsubscribe teardown aborts underlying request
      return () => controller.abort();
    });
  }
}
