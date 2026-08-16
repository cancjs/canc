import { suppressCancel } from '@cancjs/promise';
import { sleep } from '@shared/util';

import { consumeFeedCanc } from './feed-streaming-canc';

async function main() {
  console.log('--- Canc Feed Streaming ---');

  const consumerPromise = consumeFeedCanc();
  suppressCancel(consumerPromise); // node one-shot script, suppress the top-level CancelError

  // Wait enough time to fetch the first page and start the second page fetch (which has 50ms latency).
  await sleep(65);

  console.log('--- User navigated away, canceling ---');
  consumerPromise.cancel();

  try {
    await consumerPromise;
  } catch (err: any) {
    if (err.name !== 'CancelError') {
      console.error('Unhandled err in main:', err.message);
    }
  }
}

main().catch(console.error);
