// Crawl a site depth-2, reporting broken (404) links, and stop the whole crawl with one cancel().
//
// Every page fetch runs through a cancel-aware pool. The crawl root is a CancelablePromise: one
// cancel() on it drains the pool, so in-flight fetches are aborted and queued fetches never start.
// One call at the top prunes the entire in-flight subtree, at every depth, with no per-level wiring.

import { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';
import { createPool } from '@shared/lib';
import { MockApi } from '@shared/mock-api';
import { createSiteApi, HOME_URL, TOTAL_PAGES, type Page } from './mock/site';
import type { CrawlReport } from './types';

/** Runs a depth-2 site-health crawl. Cancel the returned promise to abort every pending fetch. */
export function crawlSite(api: MockApi, concurrency: number): CancelablePromise<CrawlReport> {
 const site = createSiteApi(api);
 const pool = createPool(concurrency);

 // One cancelable fetch node per page. Canceling it aborts the underlying request via the signal.
 const fetchPage = cancelify(({ getSignal }, [url]: [string]) => site.fetchPage(url, getSignal()));

 const crawl = new CancelablePromise<CrawlReport>((resolve, reject, { handleCancel }) => {
 // One cancel() drains the pool: queued pages never start, in-flight pages are aborted. This is
 // the whole subtree pruned in a single call, no AbortController threaded through each level.
 handleCancel((reason) => pool.cancelAll(reason));

 const visited: string[] = [];
 const broken: string[] = [];

 const visit = async (url: string, depth: number): Promise<void> => {
 const page: Page = await pool.run(() => fetchPage(url));
 visited.push(url);
 if (page.status === 404) broken.push(url);
 if (depth > 0) await Promise.all(page.links.map((link) => visit(link, depth - 1)));
 };

 visit(HOME_URL, 2).then(() => resolve({ visited, broken }), reject);
 });

 return crawl;
}

export async function crawlCanc(api: MockApi): Promise<void> {
 console.log('canc: crawling site depth-2 through pool(4)');
 const crawl = crawlSite(api, 4);

 // The operator hits Stop while the crawl is deep into fanning out (grandchildren in flight).
 setTimeout(() => crawl.cancel('stopped by operator'), 40);

 try {
 const report = await crawl;
 console.log(`canc: crawl finished, visited ${report.visited.length}, broken ${report.broken.length}`);
 } catch {
 // canceled here, nothing below runs
 const reportStarted = api.calls.filter((call) => call.endpoint === 'site.page').length;
 const reportAborted = api.calls.filter(
 (call) => call.endpoint === 'site.page' && call.status === 'aborted'
 ).length;
 const reportNeverStarted = TOTAL_PAGES - reportStarted;
 console.log(
 `canc: crawl stopped, started = ${reportStarted}, in-flight aborted = ${reportAborted}, never started = ${reportNeverStarted}`
 );
 }
}
