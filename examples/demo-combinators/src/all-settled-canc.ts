// CancelablePromise.allSettled: waits all, no loser-cancel by definition.
// Inputs settle independently; no cancellation on first reject (by design).

import * as canc from '@cancjs/coroutine';

import { cancWidgets, mockApi } from './widgets-shared.js';

async function runAllSettledCanc(): Promise<void> {
  mockApi.reset();

  try {
    const settled = await canc.async(function* () {
      return yield* canc.await.allSettled([
        cancWidgets.loadOrders('user-1'),
        cancWidgets.checkInventory('product-1'),
        cancWidgets.checkInventory('non-existent'),
        cancWidgets.quotePrice('AAPL'),
      ]);
    })();
    console.log(`Canc allSettled - fulfilled: ${(settled as any[]).filter((r) => r.status === 'fulfilled').length}`);
  } catch {
    // (allSettled never rejects on input failure)
  }

  const reportCompleted = mockApi.calls.filter((c) => c.status === 'completed' || c.status === 'failed').length;
  console.log(`Canc allSettled - completed: ${reportCompleted}`);
}

export { runAllSettledCanc };
