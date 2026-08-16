import * as canc from '@cancjs/coroutine';
import { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';
import type { MockApiBundle, Product } from '@shared/mock-api';
import type { Order } from '@shared/mock-api/src/domains/orders';

import { report } from './report';

type ProductsApi = MockApiBundle['products'];
type InventoryApi = MockApiBundle['inventory'];
type OrdersApi = MockApiBundle['orders'];
type InvoicesApi = MockApiBundle['invoices'];

/**
 * Product profile fetch with CancelablePromise: the source can be canceled by any consumer,
 * and cancellation propagates both down (to the API calls) and up (to the source).
 * Two-way propagation teaches: (1) DOWN. cancel source, all consumers reject CancelError,
 * try/catch per consumer works. (2) UP/bubble. cancel BOTH consumers, source auto-cancels
 * (consumer counting, traces when it happens).
 */
export const loadProductProfile = canc.async(function* (
  productsApi: ProductsApi,
  inventoryApi: InventoryApi,
  ordersApi: OrdersApi,
  invoicesApi: InvoicesApi,
  productId: string,
  options?: { bubble?: boolean; shield?: boolean },
) {
  const loadProduct = cancelify(({ getSignal }, id: string) => productsApi.get(id, getSignal()));

  // Stock leg: can be isolated with bubble:false. Omit the key entirely when unset so the
  // CancelablePromise default (bubble:true) applies; passing bubble:undefined would force false.
  const checkInventory = cancelify(
    ({ getSignal }, id: string) => inventoryApi.check(id, getSignal()),
    options?.bubble === false ? { bubble: false } : undefined,
  );

  // Orders leg: main consumer.
  const loadOrders = cancelify(({ getSignal }, id: string) => ordersApi.forProduct(id, getSignal()));

  // Audit log: shielded from cancellation but still sees upstream rejection.
  const loadAuditLog = cancelify(({ getSignal }, id: string) => invoicesApi.get(id, getSignal()), {
    shield: options?.shield,
  });

  report('fetching product');
  const product = yield* canc.await(loadProduct(productId));

  report('starting inventory + orders fetch');
  const auditPromise = loadAuditLog('audit-1');

  const legsPromise = CancelablePromise.all([checkInventory(productId), loadOrders(productId)]);

  report('awaiting all');
  const [stock, orders] = yield* canc.await(legsPromise);

  yield* canc.await(auditPromise);

  report('returning results');
  return { product, stock, orders };
});
