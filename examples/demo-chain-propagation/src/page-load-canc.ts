import * as canc from '@cancjs/coroutine';
import { cancelify } from '@cancjs/toolbox';
import type { MockApiBundle } from '@shared/mock-api';

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

  // Omit the key when unset, since bubble:undefined would force false, not the default true
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

  report('starting product, stock, orders and audit fetches');
  // Neither leg reads the product, so all four requests start before the first suspension point.
  // A cancel arriving on the next tick then finds four calls in flight, not one.
  const productPromise = loadProduct(productId);
  const stockPromise = checkInventory(productId);
  const ordersPromise = loadOrders(productId);
  const auditPromise = loadAuditLog('audit-1');

  try {
    const product = yield* canc.await(productPromise);

    report('product ready, awaiting stock and orders');
    const [stock, orders] = yield* canc.await.all([stockPromise, ordersPromise]);

    report('awaiting audit');
    // consumed here on the happy path, canceled in the finally below unless shield:true
    yield* canc.await(auditPromise);

    report('returning results');
    return { product, stock, orders };
  } finally {
    // A cancel reaches only the promise this coroutine is suspended on, and canceling a
    // combinator result deliberately does not reach its inputs, so the legs started earlier
    // are canceled here
    for (const leg of [stockPromise, ordersPromise]) {
      if (leg.cancelable) {
        leg.cancel();
      }
    }
    if (!options?.shield && auditPromise.cancelable) {
      auditPromise.cancel();
    }
  }
});
