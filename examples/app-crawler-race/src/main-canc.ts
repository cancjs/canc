import '@cancjs/unhandled-rejection/register';

import { MockApi } from '@shared/mock-api';

import { crawlCanc } from './crawl-canc';

async function main(): Promise<void> {
  // cancel root prunes in-flight subtree and drops queued fetches
  console.log('--- abandon a site-health crawl mid-flight ---');
  await crawlCanc(new MockApi({ latency: 15, jitter: 0 }));
}

main();
