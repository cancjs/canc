import { createMockApi, type MockApiBundle } from '@shared/mock-api';

import { loadProductProfile } from './page-load-vanilla';
import { report } from './report';

type ProductsApi = MockApiBundle['products'];
type InventoryApi = MockApiBundle['inventory'];
type OrdersApi = MockApiBundle['orders'];
type InvoicesApi = MockApiBundle['invoices'];
type MockApi = MockApiBundle['api'];

async function runScenarios(): Promise<void> {
  const mockBundle = createMockApi();
  const { products: productsApi, inventory: inventoryApi, orders: ordersApi, invoices: invoicesApi } = mockBundle;
  const api = mockBundle.api;

  console.log('\n=== Scenario 1: Down (source canceled) ===');
  await runDownScenario(api, productsApi, inventoryApi, ordersApi, invoicesApi);

  console.log('\n=== Scenario 2: Up/bubble (consumers canceled) ===');
  await runBubbleScenario(api, productsApi, inventoryApi, ordersApi, invoicesApi);

  console.log('\n=== Scenario 3: Partial (one consumer canceled) ===');
  await runPartialScenario(api, productsApi, inventoryApi, ordersApi, invoicesApi);

  console.log('\n=== Scenario 4: Shield (audit isolated) ===');
  await runShieldScenario(api, productsApi, inventoryApi, ordersApi, invoicesApi);
}

async function runDownScenario(
  api: MockApi,
  productsApi: ProductsApi,
  inventoryApi: InventoryApi,
  ordersApi: OrdersApi,
  invoicesApi: InvoicesApi,
): Promise<void> {
  api.reset();
  const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p1');

  report('user abandoned page');
  // a plain promise exposes nothing to call here, so all four requests stay in flight

  try {
    // orphaned result: computed, delivered to no one
    await profilePromise;
  } catch (_err) {
    report('load failed');
  }

  report('all four requests completed anyway');
  console.log('Mock API calls:', api.calls.map((c) => `${c.endpoint}(${c.status})`).join(', '));
}

async function runBubbleScenario(
  api: MockApi,
  productsApi: ProductsApi,
  inventoryApi: InventoryApi,
  ordersApi: OrdersApi,
  invoicesApi: InvoicesApi,
): Promise<void> {
  api.reset();
  const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p2');

  const stockConsumer = profilePromise.then((x) => x.stock);
  const ordersConsumer = profilePromise.then((x) => x.orders);

  report('both consumers abandoned');
  // dropping both references changes nothing upstream, there is no consumer counting here

  try {
    await stockConsumer;
    await ordersConsumer;
  } catch (_err) {
    report('load failed');
  }

  report('source completed anyway, nothing bubbled up');
  console.log('Mock API calls:', api.calls.map((c) => `${c.endpoint}(${c.status})`).join(', '));
}

async function runPartialScenario(
  api: MockApi,
  productsApi: ProductsApi,
  inventoryApi: InventoryApi,
  ordersApi: OrdersApi,
  invoicesApi: InvoicesApi,
): Promise<void> {
  api.reset();
  const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p3');

  const stockConsumer = profilePromise.then((x) => x.stock);
  const ordersConsumer = profilePromise.then((x) => x.orders);

  report('stock consumer abandoned');
  // no selective cancellation either, the stock request runs for a reader who left

  try {
    await stockConsumer;
    await ordersConsumer;
  } catch (_err) {
    report('load failed');
  }

  report('source completed, the abandoned leg still cost a request');
  console.log('Mock API calls:', api.calls.map((c) => `${c.endpoint}(${c.status})`).join(', '));
}

async function runShieldScenario(
  api: MockApi,
  productsApi: ProductsApi,
  inventoryApi: InventoryApi,
  ordersApi: OrdersApi,
  invoicesApi: InvoicesApi,
): Promise<void> {
  api.reset();
  const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p4');

  report('user abandoned page');

  try {
    await profilePromise;
  } catch (_err) {
    report('load failed');
  }

  // (no cancellation counterpart, see -canc) nothing was canceled, so there is nothing to shield
  report('audit completed, like every other leg');
  console.log('Mock API calls:', api.calls.map((c) => `${c.endpoint}(${c.status})`).join(', '));
}

runScenarios().catch(console.error);
