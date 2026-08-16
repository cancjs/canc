// Promise.allSettled: waits for all to settle (never rejects on individual failures).
// Native behavior: no cancel, all complete.

import { mockApi, vanillaWidgets } from './widgets-shared.js';

async function runAllSettledVanilla(): Promise<void> {
  mockApi.reset();

  try {
    const settled = await Promise.allSettled([
      vanillaWidgets.loadOrders('user-1'),
      vanillaWidgets.checkInventory('product-1'),
      vanillaWidgets.checkInventory('non-existent'), // rejects
      vanillaWidgets.quotePrice('AAPL'),
    ]);
    console.log(`Vanilla allSettled - fulfilled: ${settled.filter((r) => r.status === 'fulfilled').length}`);
  } catch {
    // (no cancel)
  }

  const reportCompleted = mockApi.calls.filter((c) => c.status === 'completed' || c.status === 'failed').length;
  console.log(`Vanilla allSettled - completed: ${reportCompleted}`);
}

export { runAllSettledVanilla };
