import { isCancelError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';
import { sleep } from '@shared/util';

import { loadProductProfile } from './page-load-canc';

// All four legs start on the first tick, in this order, and asserting the list rather than a
// bare count keeps a dropped leg from passing as a smaller number
const allEndpoints = ['products.get', 'inventory.check', 'orders.forProduct', 'invoices.get'];

describe('demo-chain-propagation scenarios', () => {
  it('down scenario: canceling the source aborts all four downstream calls', async () => {
    const mockApi = createMockApi();
    const { products: productsApi, inventory: inventoryApi, orders: ordersApi, invoices: invoicesApi } = mockApi;
    const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p1');

    profilePromise.cancel();

    try {
      await profilePromise;
      throw new Error('should have canceled');
    } catch (err) {
      expect(isCancelError(err)).toBe(true);
    }

    const calls = mockApi.api.calls;
    expect(calls).toHaveLength(4);
    expect(calls.map((c) => c.endpoint)).toEqual(allEndpoints);
    expect(calls.every((c) => c.status === 'aborted')).toBe(true);
  });

  it('bubble up scenario: canceling both consumers aborts the source', async () => {
    const mockApi = createMockApi();
    const { products: productsApi, inventory: inventoryApi, orders: ordersApi, invoices: invoicesApi } = mockApi;
    const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p2');

    const stockConsumer = profilePromise.then((x) => x.stock);
    const ordersConsumer = profilePromise.then((x) => x.orders);

    stockConsumer.cancel();
    ordersConsumer.cancel();

    try {
      await profilePromise;
      throw new Error('should have canceled');
    } catch (err) {
      expect(isCancelError(err)).toBe(true);
    }

    const calls = mockApi.api.calls;
    expect(calls).toHaveLength(4);
    expect(calls.map((c) => c.endpoint)).toEqual(allEndpoints);
    expect(calls.every((c) => c.status === 'aborted')).toBe(true);
  });

  it('partial scenario: canceling one consumer keeps the source and surviving consumer completing', async () => {
    const mockApi = createMockApi();
    const { products: productsApi, inventory: inventoryApi, orders: ordersApi, invoices: invoicesApi } = mockApi;
    const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p3');

    const stockConsumer = profilePromise.then((x) => x.stock);
    const ordersConsumer = profilePromise.then((x) => x.orders);

    stockConsumer.cancel();

    await ordersConsumer;

    const calls = mockApi.api.calls;
    expect(calls).toHaveLength(4);
    expect(calls.map((c) => c.endpoint)).toEqual(allEndpoints);
    expect(calls.every((c) => c.status === 'completed')).toBe(true);
  });

  it('shield scenario: shielded audit survives cancellation', async () => {
    const mockApi = createMockApi();
    const { products: productsApi, inventory: inventoryApi, orders: ordersApi, invoices: invoicesApi } = mockApi;
    const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p4', {
      shield: true,
    });

    profilePromise.cancel();

    try {
      await profilePromise;
      throw new Error('should have canceled');
    } catch (err) {
      expect(isCancelError(err)).toBe(true);
    }

    await sleep(80);

    const calls = mockApi.api.calls;
    expect(calls).toHaveLength(4);
    expect(calls.map((c) => c.endpoint)).toEqual(allEndpoints);

    const auditCall = calls.find((c) => c.endpoint === 'invoices.get');
    expect(auditCall?.status).toBe('completed');

    const otherCalls = calls.filter((c) => c.endpoint !== 'invoices.get');
    expect(otherCalls).toHaveLength(3);
    expect(otherCalls.every((c) => c.status === 'aborted')).toBe(true);
  });
});
