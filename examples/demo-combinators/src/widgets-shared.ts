import { cancelify } from '@cancjs/toolbox';
import { createMockApi } from '@shared/mock-api';

export const mockApiBundle = createMockApi({ latency: 50 });
export const mockApi = mockApiBundle.api;

export const cancWidgets = {
  loadOrders: cancelify(({ getSignal }, id: string) => mockApiBundle.orders.list(getSignal())),
  checkInventory: cancelify(({ getSignal }, id: string) => mockApiBundle.inventory.check(id, getSignal())),
  quotePrice: cancelify(({ getSignal }, id: string) => mockApiBundle.prices.quote(id, getSignal())),
  getDeployStatus: cancelify(({ getSignal }, id: string) => mockApiBundle.deployments.getStatus(id, getSignal())),
};

export const vanillaWidgets = {
  loadOrders: (id: string) => mockApiBundle.orders.list(),
  checkInventory: (id: string) => mockApiBundle.inventory.check(id),
  quotePrice: (id: string) => mockApiBundle.prices.quote(id),
  getDeployStatus: (id: string) => mockApiBundle.deployments.getStatus(id),
};
