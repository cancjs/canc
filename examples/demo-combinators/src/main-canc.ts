import '@cancjs/unhandled-rejection/register';

import { runAllCanc } from './all-canc.js';
import { runAllSettledCanc } from './all-settled-canc.js';
import { runAnyCanc } from './any-canc.js';
import { runIsolationCanc } from './isolation-canc.js';
import { runRaceCanc } from './race-canc.js';

async function main(): Promise<void> {
  console.log('=== CancelablePromise Combinators ===\n');

  console.log('--- all() with cancel loser ---');
  await runAllCanc();

  console.log('\n--- any() with cancel loser ---');
  await runAnyCanc();

  console.log('\n--- race() with cancel loser ---');
  await runRaceCanc();

  console.log('\n--- allSettled() (no loser cancel) ---');
  await runAllSettledCanc();

  console.log('\n--- isolation (bubble:false) ---');
  await runIsolationCanc();
}

main().catch(console.error);
