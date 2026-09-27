import type { MockApiBundle, Product } from '@shared/mock-api';
import type { Order } from '@shared/mock-api/src/domains/orders';

import { report } from './report';

type ProductsApi = MockApiBundle['products'];
type InventoryApi = MockApiBundle['inventory'];
type OrdersApi = MockApiBundle['orders'];
type InvoicesApi = MockApiBundle['invoices'];

/**
 * Product profile fetch: four requests started together, then awaited in order.
 * Vanilla: plain promises, no cancellation. If the caller abandons the page, every
 * request stays in flight (wasted work).
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
  report('starting product, stock, orders and audit fetches');
  // Same four requests start here, and nothing downstream can stop any of them once the
  // caller leaves the page
  const productPromise = productsApi.get(productId);
  const stockPromise = inventoryApi.check(productId);
  const ordersPromise = ordersApi.forProduct(productId);
  const auditPromise = invoicesApi.get('audit-1');

  try {
    const product = await productPromise;

    report('product ready, awaiting stock and orders');
    const [stock, orders] = await Promise.all([stockPromise, ordersPromise]);

    report('awaiting audit');
    // orphaned result: computed, delivered to no one
    await auditPromise;

    report('returning results');
    return { product, stock, orders };
  } finally {
    // (no cancellation counterpart, see -canc) a plain promise has no cancel, so this block
    // can log the wasted requests but cannot stop them, unlike the coroutine finally in the
    // canc twin
  }
}
