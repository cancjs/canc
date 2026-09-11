// Promise.all: vanilla has no bubble:false counterpart.
// All promises settle independently (wasted work on canceled request).

import { mockApi, vanillaWidgets } from './widgets-shared';

async function runIsolationVanilla(): Promise<void> {
  mockApi.reset();

  // (no cancellation counterpart for bubble:false, see -canc)
  const isolatedNews = vanillaWidgets.quotePrice('AAPL');

  const widgets = [
    vanillaWidgets.loadOrders('user-1'),
    vanillaWidgets.checkInventory('product-1'),
    vanillaWidgets.checkInventory('non-existent'), // fails
    isolatedNews,
  ];

  try {
    await Promise.all(widgets);
  } catch {
    // One rejected, but native Promise.all does not cancel remaining
  }

  await Promise.allSettled(widgets);

  const reportCompleted = mockApi.calls.filter((c) => c.status === 'completed').length;
  console.log(`Vanilla isolation - completed: ${reportCompleted}`);
}

export { runIsolationVanilla };
