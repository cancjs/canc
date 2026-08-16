// Promise.any: first to fulfill wins. Remaining losers keep running (native behavior).

import { mockApi, vanillaWidgets } from './widgets-shared.js';

async function runAnyVanilla(): Promise<void> {
  mockApi.reset();

  try {
    const winner = await Promise.any([
      vanillaWidgets.checkInventory('non-existent'), // fails
      vanillaWidgets.loadOrders('user-1'), // winner
      vanillaWidgets.quotePrice('AAPL'),
      vanillaWidgets.getDeployStatus('deploy-1'),
    ]);
    console.log(`Vanilla any - winner: ${JSON.stringify(winner)}`);
  } catch {
    // AggregateError if all reject
  }

  const reportCompleted = mockApi.calls.filter((c) => c.status === 'completed').length;
  // (no canceled in vanilla, remaining losers stay in 'started' state)
  console.log(`Vanilla any - losers completed: ${reportCompleted}`);
}

export { runAnyVanilla };
