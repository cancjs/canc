import { isCancelError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';

import { loadProductProfile } from './page-load-canc';

describe('demo-chain-propagation scenarios', () => {
  it('down scenario: canceling the source aborts all three downstream calls', async () => {
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

    const callStatuses = mockApi.api.calls.map((c: any) => c.status);
    expect(callStatuses.every((s: any) => s === 'aborted')).toBe(true);
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

    const callStatuses = mockApi.api.calls.map((c: any) => c.status);
    expect(callStatuses.every((s: any) => s === 'aborted')).toBe(true);
  });

  it('partial scenario: canceling one consumer keeps the source and surviving consumer completing', async () => {
    const mockApi = createMockApi();
    const { products: productsApi, inventory: inventoryApi, orders: ordersApi, invoices: invoicesApi } = mockApi;
    const profilePromise = loadProductProfile(productsApi, inventoryApi, ordersApi, invoicesApi, 'p3');

    const stockConsumer = profilePromise.then((x) => x.stock);
    const ordersConsumer = profilePromise.then((x) => x.orders);

    stockConsumer.cancel();

    await ordersConsumer;

    const callStatuses = mockApi.api.calls.map((c: any) => c.status);
    expect(callStatuses.every((s: any) => s === 'completed')).toBe(true);
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

    await new Promise((resolve) => setTimeout(resolve, 80));

    const auditCall = mockApi.api.calls.find((c: any) => c.endpoint === 'invoices.get');
    expect(auditCall?.status).toBe('completed');

    const otherCalls = mockApi.api.calls.filter((c: any) => c.endpoint !== 'invoices.get');
    expect(otherCalls.every((c: any) => c.status === 'aborted')).toBe(true);
  });
});
