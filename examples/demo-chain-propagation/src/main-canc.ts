import '@cancjs/unhandled-rejection/register';

import { isCancelError } from '@cancjs/promise';
import { createMockApi, type MockApiBundle } from '@shared/mock-api';

import { loadProductProfile } from './page-load-canc';
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

  report('canceling source');
  profilePromise.cancel();

  try {
    await profilePromise;
  } catch (err) {
    report(`load canceled: ${isCancelError(err) ? 'CancelError' : String(err)}`);
  }

  report('source aborted successfully');
  console.log('Mock API calls:', api.calls.map((c: any) => `${c.endpoint}(${c.status})`).join(', '));
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

  report('simulating: both consumers canceled');
  stockConsumer.cancel();
  ordersConsumer.cancel();

  try {
    await profilePromise;
  } catch (err) {
    report(`load canceled: ${isCancelError(err) ? 'CancelError' : String(err)}`);
  }

  report('source aborted (bubble-up from both consumers)');
  console.log('Mock API calls:', api.calls.map((c: any) => `${c.endpoint}(${c.status})`).join(', '));
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

  report('simulating: stock consumer canceled');
  stockConsumer.cancel();

  try {
    await profilePromise;
  } catch (err) {
    report(`load canceled: ${isCancelError(err) ? 'CancelError' : String(err)}`);
  }

  report('source completed (orders consumer kept running)');
  console.log('Mock API calls:', api.calls.map((c: any) => `${c.endpoint}(${c.status})`).join(', '));
}

async function runShieldScenario(
  api: MockApi,
  productsApi: ProductsApi,
  inventoryApi: InventoryApi,
  ordersApi: OrdersApi,
  invoicesApi: InvoicesApi,
): Promise<void> {
  api.reset();
  const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p4', { shield: true });

  report('canceling source');
  profilePromise.cancel();

  try {
    await profilePromise;
  } catch (err) {
    report(`load canceled: ${isCancelError(err) ? 'CancelError' : String(err)}`);
  }

  report('audit completed despite source cancellation (shield:true)');
  console.log('Mock API calls:', api.calls.map((c: any) => `${c.endpoint}(${c.status})`).join(', '));
}

runScenarios().catch(console.error);
