// Promise.race: first to settle (win or fail) returns; remaining keep running.

import { mockApi, vanillaWidgets } from './widgets-shared';

async function runRaceVanilla(): Promise<void> {
  mockApi.reset();

  const widgets = [
    vanillaWidgets.getDeployStatus('deploy-1'), // winner
    vanillaWidgets.loadOrders('user-1'),
    vanillaWidgets.checkInventory('product-1'),
    vanillaWidgets.quotePrice('AAPL'),
  ];

  try {
    const winner = await Promise.race(widgets);
    console.log(`Vanilla race - winner: ${JSON.stringify(winner)}`);
  } catch {
    // Race completed (by rejection)
  }

  await Promise.allSettled(widgets);

  const reportSettled = mockApi.calls.filter((c) => c.status === 'completed' || c.status === 'failed').length;
  console.log(`Vanilla race - settled: ${reportSettled}`);
}

export { runRaceVanilla };
