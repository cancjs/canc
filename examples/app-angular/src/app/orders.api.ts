// DI token allowing tests to inject mock orders API with controlled latency

import { InjectionToken } from '@angular/core';

import { createOrdersApi, type OrdersApi } from '../mock/api';

export const ORDERS_API = new InjectionToken<OrdersApi>('ORDERS_API', {
  providedIn: 'root',
  factory: () => createOrdersApi(),
});
