import { MockApi } from '@shared/mock-api';

import { crawlCanc } from './crawl-canc';

async function main(): Promise<void> {
  // Crawl the site depth-2, then hit Stop mid-flight. One cancel() on the crawl root prunes the
  // whole in-flight subtree: queued page fetches never start and in-flight ones are aborted.
  console.log('--- abandon a site-health crawl mid-flight ---');
  await crawlCanc(new MockApi({ latency: 15, jitter: 0 }));
}

main();
