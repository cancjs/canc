// CancelablePromise.any: first to fulfill wins, loser inputs canceled.
// Demonstrates cancel propagation (down to losers on first win).

import * as canc from '@cancjs/coroutine';

import { cancWidgets, mockApi } from './widgets-shared.js';

const runAnyCanc = canc.async(function* () {
  mockApi.reset();

  try {
    const winner = yield* canc.await.any([
      cancWidgets.checkInventory('non-existent'), // fails
      cancWidgets.loadOrders('user-1'), // winner
      cancWidgets.quotePrice('AAPL'),
      cancWidgets.getDeployStatus('deploy-1'),
    ]);
    console.log(`Canc any - winner: ${JSON.stringify(winner)}`);
  } catch {
    // canceled here: loser inputs canceled
  }

  const reportCanceled = mockApi.calls.filter((c) => c.status === 'aborted').length;
  console.log(`Canc any - canceled: ${reportCanceled}`);
});

export { runAnyCanc };
