import { sleep } from '@shared/util';
import { createMockApi } from '@shared/mock-api';
import { firstQuote as firstQuoteCanc } from '../src/compare-canc';
import { firstQuote as firstQuoteVanilla } from '../src/compare-vanilla';
import { crawlAllSuppliers as crawlCanc } from '../src/crawl-canc';
import { crawlAllSuppliers as crawlVanilla } from '../src/crawl-vanilla';
import { SUPPLIER_IDS, TARGET_PART } from '../src/aux/catalog';

const quoteCalls = (mockApi: ReturnType<typeof createMockApi>, status: string) =>
 mockApi.api.calls.filter((call) => call.endpoint === 'catalog.quote' && call.status === status).length;
const pageCalls = (mockApi: ReturnType<typeof createMockApi>, status?: string) =>
 mockApi.api.calls.filter((call) => call.endpoint === 'catalog.page' && (!status || call.status === status)).length;

describe('app-crawler-race smoke', () => {
 it('any(): winner completes, the other N-1 quote requests are aborted', async () => {
 const mockApi = createMockApi({ latency: 40, jitter: 0 });

 await firstQuoteCanc(mockApi, TARGET_PART);
 // Let any straggler abort markers flush.
 await sleep(80);

 expect(quoteCalls(mockApi, 'completed')).toBe(1);
 expect(quoteCalls(mockApi, 'aborted')).toBe(SUPPLIER_IDS.length - 1);
 });

 it('vanilla any(): every supplier request runs to completion (the bug we teach)', async () => {
 const mockApi = createMockApi({ latency: 40, jitter: 0 });

 await firstQuoteVanilla(mockApi, TARGET_PART);
 await sleep(80);

 // Inverted assertion documenting the leak: no aborts, all N complete.
 expect(quoteCalls(mockApi, 'aborted')).toBe(0);
 expect(quoteCalls(mockApi, 'completed')).toBe(SUPPLIER_IDS.length);
 });

 it('crawl root cancel: in-flight pages aborted, queued pages never started', async () => {
 const mockApi = createMockApi({ latency: 40, jitter: 0 });

 const { result, cancel } = crawlCanc(mockApi);
 // Cancel after the root pages are in flight but before their children can be fetched.
 setTimeout(cancel, 15);

 let canceled = false;
 try {
 await result;
 } catch {
 canceled = true;
 }
 await sleep(80);

 expect(canceled).toBe(true);
 // Total depth-2 pages if the crawl ran fully = 3 root + 6 children = 9.
 const fullCrawl = SUPPLIER_IDS.length * 3;
 expect(pageCalls(mockApi)).toBeLessThan(fullCrawl);
 // At least one active fetch was aborted, and nothing completed after cancel drained the queue.
 expect(pageCalls(mockApi, 'aborted')).toBeGreaterThan(0);
 });

 it('vanilla crawl: cancel is a no-op, every catalog page is fetched', async () => {
 const mockApi = createMockApi({ latency: 40, jitter: 0 });

 const { result, cancel } = crawlVanilla(mockApi);
 setTimeout(cancel, 15);
 await result;

 // Inverted assertion: the full depth-2 tree is fetched despite the abandon.
 const fullCrawl = SUPPLIER_IDS.length * 3;
 expect(pageCalls(mockApi, 'aborted')).toBe(0);
 expect(pageCalls(mockApi, 'completed')).toBe(fullCrawl);
 });
});
