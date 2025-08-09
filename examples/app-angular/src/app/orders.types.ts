// Shared shapes for the orders service. Suffix-free: identical across both service flavors, so only
// the decorator vs manual wiring differs between them.

import { InjectionToken } from '@angular/core';
import type { OrderSummary, OrderDetail } from '../mock/api';

export type { OrderSummary, OrderDetail };

/** The service contract both flavors satisfy. Methods return promises the component can cancel. */
export interface OrdersServiceShape {
 list(): Promise<OrderSummary[]>;
 detail(id: string): Promise<OrderDetail>;
}

/** DI token the dashboard depends on. Swapping its provider swaps the whole service flavor. */
export const ORDERS_SERVICE = new InjectionToken<OrdersServiceShape>('ORDERS_SERVICE');
