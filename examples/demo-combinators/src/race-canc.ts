// CancelablePromise.race: first to settle wins, rest canceled.
// Demonstrates cancel of losers on any settlement.

import * as canc from '@cancjs/coroutine';

import { cancWidgets, mockApi } from './widgets-shared.js';

const runRaceCanc = canc.async(function* () {
  mockApi.reset();

  try {
    const winner = yield* canc.await.race([
      cancWidgets.getDeployStatus('deploy-1'), // winner
      cancWidgets.loadOrders('user-1'),
      cancWidgets.checkInventory('product-1'),
      cancWidgets.quotePrice('AAPL'),
    ]);
    console.log(`Canc race - winner: ${JSON.stringify(winner)}`);
  } catch {
    // Race completed (by rejection)
  }

  const reportCanceled = mockApi.calls.filter((c) => c.status === 'aborted').length;
  console.log(`Canc race - canceled: ${reportCanceled}`);
});

export { runRaceCanc };
