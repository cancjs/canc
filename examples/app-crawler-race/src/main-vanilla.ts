import { MockApi } from '@shared/mock-api';

import { crawlVanilla } from './crawl-vanilla';

async function main(): Promise<void> {
  // hand-rolled abort only reaches running fetches; queued pages still start
  console.log('--- abandon a site-health crawl mid-flight ---');
  await crawlVanilla(new MockApi({ latency: 15, jitter: 0 }));
}

main();
