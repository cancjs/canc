import { sleep } from '@shared/util';
import { MockApi } from '@shared/mock-api';
import { crawlSite as crawlSiteCanc } from '../src/crawl-canc';
import { crawlSite as crawlSiteVanilla } from '../src/crawl-vanilla';
import { TOTAL_PAGES } from '../src/mock/site';

const pageCalls = (api: MockApi, status?: string) =>
 api.calls.filter((call) => call.endpoint === 'site.page' && (!status || call.status === status)).length;

/** Resolves once `count` page fetches have started, so a test can cancel at a deterministic point. */
function afterStarted(api: MockApi, count: number): Promise<void> {
 return new Promise((resolve) => {
 const check = () => (pageCalls(api) >= count ? resolve() : setTimeout(check, 2));
 check();
 });
}

describe('app-crawler-race smoke', () => {
 it('canc: one cancel() aborts in-flight fetches and stops the queued ones', async () => {
 const api = new MockApi({ latency: 30, jitter: 0 });

 const crawl = crawlSiteCanc(api, 2);
 // Cancel once the crawl has fanned out past the first page, so both aborts and drops happen.
 await afterStarted(api, 3);
 crawl.cancel('stopped');

 let canceled = false;
 try {
 await crawl;
 } catch {
 canceled = true;
 }
 // Give a full latency window to settle, proving none complete after the cancel.
 await sleep(80);

 expect(canceled).toBe(true);
 // Some pages were in flight and got aborted.
 expect(pageCalls(api, 'aborted')).toBeGreaterThan(0);
 // Some pages never started at all: the cancel drained the queue before they got a slot.
 expect(pageCalls(api)).toBeLessThan(TOTAL_PAGES);
 // Every started page either finished before the cancel or was aborted, none left pending.
 expect(pageCalls(api, 'aborted') + pageCalls(api, 'completed')).toBe(pageCalls(api));
 });

 it('vanilla leaks where canc prunes: more pages complete under the same Stop', async () => {
 // Same site, same concurrency, canceled at the same deterministic point for both flavors.
 const cancApi = new MockApi({ latency: 30, jitter: 0 });
 const cancCrawl = crawlSiteCanc(cancApi, 2);
 await afterStarted(cancApi, 3);
 cancCrawl.cancel('stopped');
 await cancCrawl.catch(() => {});

 const vanillaApi = new MockApi({ latency: 30, jitter: 0 });
 const vanilla = crawlSiteVanilla(vanillaApi, 2);
 await afterStarted(vanillaApi, 3);
 vanilla.cancel();
 await vanilla.result.catch(() => {});

 // Let both settle fully so leaked vanilla fetches land in its log.
 await sleep(150);

 // The leak: the vanilla queue keeps pumping past Stop, so it completes strictly more pages than
 // the canc crawl, whose one cancel() drained the pool.
 expect(pageCalls(vanillaApi, 'completed')).toBeGreaterThan(pageCalls(cancApi, 'completed'));
 });
});
