// DI wiring for the fake orders API. The service flavors depend on this token, not on the mock
// module directly, so a test can inject an API with controlled latency. Pretend the provided value
// is your HTTP-backed data client.

import { InjectionToken } from '@angular/core';
import { createOrdersApi, type OrdersApi } from '../mock/api';

export const ORDERS_API = new InjectionToken<OrdersApi>('ORDERS_API', {
 providedIn: 'root',
 factory: () => createOrdersApi(),
});
