import { provideHttpClient } from '@angular/common/http';
import { type ApplicationConfig, type Provider, provideZoneChangeDetection } from '@angular/core';

import { toCancelablePromise } from '../lib/to-cancelable-promise';
import { OrdersService } from './orders.service-canc';
import { OrdersServiceManual } from './orders.service-manual-canc';
import { OrdersServiceObservable } from './orders.service-obs';
import { CANCELABLE_ORDERS_SERVICE, type CancelableOrdersService } from './orders.types';

// Which service the dashboard runs against. All three satisfy CANCELABLE_ORDERS_SERVICE, so the
// components never change: coroutines behind a decorator, the same coroutines wired by hand, or
// RxJS adapted.
type OrdersFlavor = 'decorator' | 'manual' | 'observable';

const FLAVOR: OrdersFlavor = 'decorator';

/**
 * Adapts the Observable service to the promise contract. Cancel becomes unsubscribe becomes abort:
 * canceling one of these promises unsubscribes from the request observable, and that teardown aborts
 * the request. The canc components stay exactly as they are, with RxJS underneath.
 */
export function toCancelableOrdersService(source: OrdersServiceObservable): CancelableOrdersService {
  return {
    list: () => toCancelablePromise(source.list()),
    detail: (id) => toCancelablePromise(source.detail(id)),
  };
}

const ORDERS_SERVICE_PROVIDERS: Record<OrdersFlavor, Provider> = {
  decorator: { provide: CANCELABLE_ORDERS_SERVICE, useClass: OrdersService },
  manual: { provide: CANCELABLE_ORDERS_SERVICE, useClass: OrdersServiceManual },
  observable: {
    provide: CANCELABLE_ORDERS_SERVICE,
    useFactory: toCancelableOrdersService,
    deps: [OrdersServiceObservable],
  },
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    OrdersServiceObservable,
    ORDERS_SERVICE_PROVIDERS[FLAVOR],
  ],
};
