// Crawl each supplier's catalog to depth 2, looking for the target part, then quote it.
//
// The crawl walks the root page, then its child pages, fetching each through a fixed-concurrency
// queue. Vanilla has no way to stop a crawl in progress: once the caller loses interest there is no
// cancel path, so every queued page still gets fetched and every in-flight fetch still completes.

import type { MockApiBundle } from '@shared/mock-api';
import { fetchCatalogPage, ROOT_PAGE, SUPPLIER_IDS } from './aux/catalog';

// A minimal concurrency queue with no cancellation. (no cancellation counterpart — see crawl-canc.ts)
function createQueue(limit: number) {
 let active = 0;
 const waiting: Array<() => void> = [];
 const next = () => {
 active--;
 pump();
 };
 const pump = () => {
 while (active < limit && waiting.length > 0) {
 const start = waiting.shift();
 start?.();
 }
 };
 return function run<T>(job: () => Promise<T>): Promise<T> {
 return new Promise<T>((resolve, reject) => {
 // no cancel-while-queued path — a queued job always runs eventually
 const start = () => {
 active++;
 job().then(resolve, reject).finally(next);
 };
 waiting.push(start);
 pump();
 });
 };
}

/** Depth-2 crawl of one supplier's catalog. Returns every part number found. */
async function crawlSupplier(
 mockApi: MockApiBundle,
 run: <T>(job: () => Promise<T>) => Promise<T>,
 supplierId: string
): Promise<string[]> {
 const root = await run(() => fetchCatalogPage(mockApi, supplierId, ROOT_PAGE));
 const childPages = await Promise.all(
 root.childPages.map((pageId) => run(() => fetchCatalogPage(mockApi, supplierId, pageId)))
 );
 return [...root.parts, ...childPages.flatMap((page) => page.parts)];
}

export function crawlAllSuppliers(mockApi: MockApiBundle): {
 result: Promise<Record<string, string[]>>;
 cancel: () => void;
} {
 const run = createQueue(4);

 const result = (async () => {
 const entries = await Promise.all(
 SUPPLIER_IDS.map(async (supplierId) => [supplierId, await crawlSupplier(mockApi, run, supplierId)] as const)
 );
 return Object.fromEntries(entries);
 })();

 // cancel() cannot stop the crawl — queued pages still fetch, in-flight pages still complete
 const cancel = () => {};

 return { result, cancel };
}

export async function crawlVanilla(mockApi: MockApiBundle): Promise<void> {
 console.log('vanilla: crawling supplier catalogs depth-2');
 const { result, cancel } = crawlAllSuppliers(mockApi);

 // The caller abandons the crawl early, but there is no working cancel path.
 setTimeout(cancel, 30);

 const found = await result;
 const started = mockApi.api.calls.filter((call) => call.endpoint === 'catalog.page').length;
 console.log(`vanilla: crawl finished, page fetches started = ${started} (nothing was skipped)`);
 console.log(`vanilla: found parts for ${Object.keys(found).length} suppliers`);
}
