import { runAllSettledVanilla } from './all-settled-vanilla.js';
import { runAllVanilla } from './all-vanilla.js';
import { runAnyVanilla } from './any-vanilla.js';
import { runIsolationVanilla } from './isolation-vanilla.js';
import { runRaceVanilla } from './race-vanilla.js';

async function main(): Promise<void> {
  console.log('=== Promise (vanilla) Combinators ===\n');

  console.log('--- all() ---');
  await runAllVanilla();

  console.log('\n--- any() ---');
  await runAnyVanilla();

  console.log('\n--- race() ---');
  await runRaceVanilla();

  console.log('\n--- allSettled() ---');
  await runAllSettledVanilla();

  console.log('\n--- isolation (manual flag) ---');
  await runIsolationVanilla();
}

main().catch(console.error);
