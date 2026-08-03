// Observable flavor of the orders service. This is the fair RxJS competitor: the request is
// started inside the Observable and its teardown aborts, which is exactly how Angular's own
// HttpClient behaves. Unsubscribing therefore cancels for real, it does not merely ignore the
// response.
//
// Two ways to consume it are shown. The pure-RxJS components (the -obs twins) subscribe to it
// directly, with switchMap for the supersede and takeUntilDestroyed for the unmount. The canc
// components consume the same service through toCancelablePromise, which turns unsubscribe into
// cancel() and lets the two cancellation systems cooperate (see app.config-obs.ts).

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
          // An abort rejects the request too, but by then nobody is listening.
          if (subscriber.closed) return;
          subscriber.error(error);
        },
      );

      // Teardown is the cancellation this flavor has. It runs on unsubscribe and on the
      // takeUntilDestroyed teardown, so both the supersede and the unmount abort the request.
      return () => controller.abort();
    });
  }
}
