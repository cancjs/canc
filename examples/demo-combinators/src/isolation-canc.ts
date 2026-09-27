// CancelablePromise with bubble:false isolates input from siblings' fate.
// When all siblings cancel, the isolated input survives (remains pending).

import * as canc from '@cancjs/coroutine';

import { cancWidgets, mockApi } from './widgets-shared.js';

const runIsolationCanc = canc.async(function* () {
  mockApi.reset();

  const isolatedNews = cancWidgets.quotePrice('AAPL');
  isolatedNews.bubble = false;

  try {
    yield* canc.await.all([
      cancWidgets.loadOrders('user-1'),
      cancWidgets.checkInventory('product-1'),
      cancWidgets.checkInventory('non-existent'), // fails
      isolatedNews, // bubble:false (isolated)
    ]);
  } catch {
    // canceled here, but isolated widget survives due to bubble:false
  }

  const reportCompleted = mockApi.calls.filter((c) => c.status === 'completed').length;
  const reportCanceled = mockApi.calls.filter((c) => c.status === 'aborted').length;
  console.log(`Canc isolation - completed: ${reportCompleted}, canceled: ${reportCanceled}`);
});

export { runIsolationCanc };
