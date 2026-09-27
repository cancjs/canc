// CancelablePromise.all: when one widget fails, remaining inputs are canceled.
// Demonstrates two-way cancel propagation (down through losers).

import * as canc from '@cancjs/coroutine';

import { cancWidgets, mockApi } from './widgets-shared.js';

const runAllCanc = canc.async(function* () {
  mockApi.reset();

  try {
    yield* canc.await.all([
      cancWidgets.loadOrders('user-1'),
      cancWidgets.checkInventory('product-1'),
      cancWidgets.checkInventory('non-existent'), // fails first
      cancWidgets.quotePrice('AAPL'),
    ]);
  } catch {
    // canceled here: remaining inputs canceled automatically
  }

  const reportCompleted = mockApi.calls.filter((c) => c.status === 'completed').length;
  const reportCanceled = mockApi.calls.filter((c) => c.status === 'aborted').length;
  console.log(`Canc all - completed: ${reportCompleted}, canceled: ${reportCanceled}`);
});

export { runAllCanc };
