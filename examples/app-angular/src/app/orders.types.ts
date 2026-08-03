// Shared shapes for the orders service. Suffix-free: identical across both service flavors, so only
// the decorator vs manual wiring differs between them.

import { InjectionToken } from '@angular/core';
import type { CancelablePromise } from '@cancjs/promise';

import type { OrderDetail, OrderSummary } from '../mock/api';

export type { OrderDetail, OrderSummary };

/** What the vanilla service hands back: a promise its caller can only ignore. */
export interface OrdersServiceShape {
  list(): Promise<OrderSummary[]>;
  detail(id: string): Promise<OrderDetail>;
}

/**
 * What every canc flavor hands back. Writing the token's type this way is what keeps the canc
 * components cast-free: a token typed with a plain promise would erase the one property the
 * components need.
 */
export interface CancelableOrdersService {
  list(): CancelablePromise<OrderSummary[]>;
  detail(id: string): CancelablePromise<OrderDetail>;
}

/** DI token the vanilla dashboard depends on. */
export const ORDERS_SERVICE = new InjectionToken<OrdersServiceShape>('ORDERS_SERVICE');

/** DI token the canc dashboard depends on. Swapping its provider swaps the canc flavor. */
export const CANCELABLE_ORDERS_SERVICE = new InjectionToken<CancelableOrdersService>('CANCELABLE_ORDERS_SERVICE');
