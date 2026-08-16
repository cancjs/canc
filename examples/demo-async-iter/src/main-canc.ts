import { isCancelError } from '@cancjs/promise';
import { sleep } from '@shared/util';

import { concatStreams, filterAndFormat, streamWithBreak, threeConsumers, topPositiveIds } from './reconciliation-canc';

async function main() {
  const log = (msg: string) => console.log(`  ${msg}`);

  console.log('\n--- Scenario 1: Filter and Map ---');
  const items = await filterAndFormat(log);
  console.log('Result:', items);

  console.log('\n--- Scenario 2: Three Consume Forms ---');
  await threeConsumers(log);

  console.log('\n--- Scenario 3: Concat Streams ---');
  const allIds = await concatStreams(log);
  console.log('All ids:', allIds);

  console.log('\n--- Scenario 4: Stream with Break ---');
  await streamWithBreak(log, (tx) => {
    console.log(`  processing: ${tx.id}`);
    return tx.id !== 'tx-2';
  });

  console.log('\n--- Scenario 5 (BONUS): Top Positive Ids ---');
  const top = await topPositiveIds(log);
  console.log('Top positive:', top);

  console.log('\n--- Scenario 6: Cancel Mid-pipeline ---');
  const pipeline = filterAndFormat(log);
  await sleep(40);
  console.log('Canceling...');
  pipeline.cancel();
  try {
    await pipeline;
  } catch (err) {
    console.log(`Stopped: ${isCancelError(err) ? 'CancelError' : String(err)}`);
  }
}

main().catch(console.error);
