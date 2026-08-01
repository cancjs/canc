import { clone } from '@shared/util';

import { AbortSignalLike, MockApi } from '../core';

export interface Order {
  id: string;
  productId: string;
  quantity: number;
}

const ORDERS: Order[] = [
  { id: 'o1', productId: 'p1', quantity: 2 },
  { id: 'o2', productId: 'p3', quantity: 1 },
];

export interface OrdersApi {
  list(signal?: AbortSignalLike): Promise<Order[]>;
  forProduct(productId: string, signal?: AbortSignalLike): Promise<Order[]>;
}

export function createOrdersApi(api: MockApi): OrdersApi {
  return {
    list: (signal) => api.respond('orders.list', {}, () => clone(ORDERS), signal),
    forProduct: (productId, signal) =>
      api.respond(
        'orders.forProduct',
        { productId },
        () => clone(ORDERS.filter((o) => o.productId === productId)),
        signal,
      ),
  };
}
