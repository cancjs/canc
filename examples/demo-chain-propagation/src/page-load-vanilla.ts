import type { MockApiBundle, Product } from '@shared/mock-api';
import type { Order } from '@shared/mock-api/src/domains/orders';

import { report } from './report';

type ProductsApi = MockApiBundle['products'];
type InventoryApi = MockApiBundle['inventory'];
type OrdersApi = MockApiBundle['orders'];
type InvoicesApi = MockApiBundle['invoices'];

/**
 * Product profile fetch: single source fanning out to two consumers (inventory + orders).
 * Vanilla: plain promises, no cancellation. If the caller abandons the page, both
 * downstream requests stay in flight (wasted work).
 */
export async function loadProductProfile(
  productsApi: ProductsApi,
  inventoryApi: InventoryApi,
  ordersApi: OrdersApi,
  invoicesApi: InvoicesApi,
  productId: string,
): Promise<{
  product: Product;
  stock: number;
  orders: Order[];
}> {
  report('fetching product');
  // keeps running, nobody can stop this from the consumer side
  const product = await productsApi.get(productId);

  report('starting inventory + orders fetch');
  // Both consumers start: inventory and orders.
  // If the consumer cancels now, neither request stops.
  const auditPromise = invoicesApi.get('audit-1');
  const inventoryPromise = inventoryApi.check(productId);
  const ordersPromise = ordersApi.forProduct(productId);

  const [stock, orders] = await Promise.all([inventoryPromise, ordersPromise]);

  report('writing audit log');
  // orphaned result: computed, delivered to no one
  await auditPromise;

  report('returning results');
  return { product, stock, orders };
}
