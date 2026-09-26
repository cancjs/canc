// Without cancellation support, isolation requires manual flag tracking.
// When one widget fails, dependent widgets must manually check _isCanceled.

import { mockApi, vanillaWidgets } from './widgets-shared.js';

let isCanceled = false;

// manual isolation wrap
const manualIsolatedNews = async (symbol: string) => {
  const result = await vanillaWidgets.quotePrice(symbol);
  if (isCanceled) throw new Error(`isolated quotePrice canceled`);
  return result;
};

async function runIsolationVanilla(): Promise<void> {
  mockApi.reset();
  isCanceled = false;

  try {
    await Promise.all([
      vanillaWidgets.loadOrders('user-1').catch((e) => {
        isCanceled = true;
        throw e;
      }),
      vanillaWidgets.checkInventory('product-1').catch((e) => {
        isCanceled = true;
        throw e;
      }),
      vanillaWidgets.checkInventory('non-existent').catch((e) => {
        isCanceled = true;
        throw e;
      }), // fails
      manualIsolatedNews('AAPL'),
    ]);
  } catch {
    // keeps running (isolation not automatic)
  }

  const reportCompleted = mockApi.calls.filter((c) => c.status === 'completed').length;
  console.log(`Vanilla isolation - completed: ${reportCompleted}`);
}

export { runIsolationVanilla };
