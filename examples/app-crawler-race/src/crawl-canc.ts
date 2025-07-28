// Crawl each supplier's catalog to depth 2, looking for the target part, then quote it.
//
// The crawl walks the root page, then its child pages, fetching each through a cancel-aware pool.
// Canceling the crawl root drains the pool: in-flight page fetches are aborted and queued pages
// never start (born-canceled). One cancel() on the root reaches every level of the crawl.

import { CancelablePromise } from '@cancjs/promise';
import type { MockApiBundle, AbortSignalLike } from '@shared/mock-api';
import { fetchCatalogPage, ROOT_PAGE, SUPPLIER_IDS } from './aux/catalog';
import { createPool, type Pool } from './lib/pool';

// One page fetch as a CancelablePromise so the pool can cancel it, aborting the underlying request.
function fetchPage(mockApi: MockApiBundle, supplierId: string, pageId: string): CancelablePromise<{ parts: string[]; childPages: string[] }> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 fetchCatalogPage(mockApi, supplierId, pageId, controller.signal as AbortSignalLike).then(resolve, reject);
 // canceled here — the abort signal fires and the page fetch is aborted, nothing below runs
 handleCancel(() => controller.abort());
 });
}

/** Depth-2 crawl of one supplier's catalog. Returns every part number found. */
async function crawlSupplier(mockApi: MockApiBundle, pool: Pool, supplierId: string): Promise<string[]> {
 const root = await pool.run(() => fetchPage(mockApi, supplierId, ROOT_PAGE));
 const childPages = await CancelablePromise.all(
 root.childPages.map((pageId) => pool.run(() => fetchPage(mockApi, supplierId, pageId)))
 );
 return [...root.parts, ...childPages.flatMap((page) => page.parts)];
}

export function crawlAllSuppliers(mockApi: MockApiBundle): {
 result: CancelablePromise<Record<string, string[]>>;
 cancel: () => void;
} {
 const pool = createPool(4);

 const result = new CancelablePromise<Record<string, string[]>>((resolve, reject, handleCancel) => {
 Promise.all(
 SUPPLIER_IDS.map(async (supplierId) => [supplierId, await crawlSupplier(mockApi, pool, supplierId)] as const)
 ).then((entries) => resolve(Object.fromEntries(entries)), reject);
 // cancel() drains the pool — queued pages never start, in-flight pages are aborted
 handleCancel((reason) => pool.cancelAll(reason));
 });

 const cancel = () => result.cancel();

 return { result, cancel };
}

export async function crawlCanc(mockApi: MockApiBundle): Promise<void> {
 console.log('canc: crawling supplier catalogs depth-2 through pool(4)');
 const { result, cancel } = crawlAllSuppliers(mockApi);

 // The caller abandons the crawl early; one cancel() drains every pending fetch.
 setTimeout(cancel, 30);

 try {
 await result;
 console.log('canc: crawl finished');
 } catch {
 // canceled here — crawl stopped, queued pages never started
 const started = mockApi.api.calls.filter((call) => call.endpoint === 'catalog.page').length;
 const aborted = mockApi.api.calls.filter(
 (call) => call.endpoint === 'catalog.page' && call.status === 'aborted'
 ).length;
 console.log(`canc: crawl canceled, page fetches started = ${started}, aborted = ${aborted}`);
 }
}
