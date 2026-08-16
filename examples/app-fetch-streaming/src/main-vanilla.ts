import { sleep } from '@shared/util';

import { consumeFeedVanilla } from './feed-streaming-vanilla';

async function main() {
  console.log('--- Vanilla Feed Streaming ---');

  const controller = new AbortController();
  const consumerPromise = consumeFeedVanilla(controller.signal);

  // Wait enough time to fetch the first page and start the second page fetch (which has 50ms latency).
  await sleep(65);

  console.log('--- User navigated away, aborting ---');
  controller.abort();

  try {
    await consumerPromise;
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      console.error('Unhandled err in main:', err.message);
    }
  }
}

main().catch(console.error);
