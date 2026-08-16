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
  report('canceling source');
  const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p1');

  // Simulate: user leaves before completion.
  // In vanilla, there is no way to cancel from here.
  // Result: keeps running, nobody can stop this from the consumer side.
  report('(cannot cancel from here in vanilla)');
  report('user abandoned page');

  try {
    // orphaned result: computed, delivered to no one
    await profilePromise;
  } catch (_err) {
    report('load failed');
  }

  report('log: remaining calls completed anyway');
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
  report('canceling both consumers');
  const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p2');

  const stockConsumer = profilePromise.then((x) => x.stock);
  const ordersConsumer = profilePromise.then((x) => x.orders);

  // In vanilla, you might keep the promise around and hope nothing else happens.
  report('user abandoned page (no cancellation possible)');

  try {
    await stockConsumer;
    await ordersConsumer;
  } catch (_err) {
    report('load failed');
  }

  report('completed');
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
  report('canceling one consumer');
  const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p3');

  const stockConsumer = profilePromise.then((x) => x.stock);
  const ordersConsumer = profilePromise.then((x) => x.orders);

  report('user abandoned page (no selective cancellation)');

  try {
    await stockConsumer;
    await ordersConsumer;
  } catch (_err) {
    report('load failed');
  }

  report('completed');
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
  report('canceling source with shielded audit leg');
  const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p4');

  report('user abandoned page');

  try {
    await profilePromise;
  } catch (_err) {
    report('load failed');
  }

  report('completed');
  console.log('Mock API calls:', api.calls.map((c) => `${c.endpoint}(${c.status})`).join(', '));
}

runScenarios().catch(console.error);
