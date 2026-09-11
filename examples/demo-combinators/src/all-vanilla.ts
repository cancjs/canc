// Promise.all: native behavior keeps remaining widgets running after one fails.
// All promises settle independently (wasted work on canceled request).

import { mockApi, vanillaWidgets } from './widgets-shared';

async function runAllVanilla(): Promise<void> {
  mockApi.reset();

  const widgets = [
    vanillaWidgets.loadOrders('user-1'),
    vanillaWidgets.checkInventory('product-1'),
    vanillaWidgets.checkInventory('non-existent'), // fails first
    vanillaWidgets.quotePrice('AAPL'),
  ];

  try {
    await Promise.all(widgets);
  } catch {
    // One rejected, but native Promise.all does not cancel remaining
    // Completed count shows how many finished (wasted work)
  }

  await Promise.allSettled(widgets);

  const reportCompleted = mockApi.calls.filter((c) => c.status === 'completed').length;
  // (no canceled in vanilla)
  console.log(`Vanilla all - completed: ${reportCompleted}`);
}

export { runAllVanilla };
