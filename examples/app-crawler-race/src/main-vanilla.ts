import { MockApi } from '@shared/mock-api';
import { crawlVanilla } from './crawl-vanilla';

async function main(): Promise<void> {
 // Crawl the site depth-2, then hit Stop mid-flight. The hand-rolled abort only reaches the fetches
 // running right now, so queued pages still start and already-dispatched fetches still complete.
 console.log('--- abandon a site-health crawl mid-flight ---');
 await crawlVanilla(new MockApi({ latency: 15, jitter: 0 }));
}

main();
