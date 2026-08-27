// Crawl a site depth-2, reporting broken (404) links, and stop the crawl with cancel().

import { CancelablePromise } from '@cancjs/promise';
import { cancelify, limit } from '@cancjs/toolbox';
import { MockApi } from '@shared/mock-api';

import { createSiteApi, HOME_URL, type Page, TOTAL_PAGES } from './mock/site';
import type { CrawlReport } from './types';

/** Runs a depth-2 site-health crawl. Cancel the returned promise to abort every pending fetch. */
export function crawlSite(api: MockApi, concurrency: number): CancelablePromise<CrawlReport> {
  const site = createSiteApi(api);
  const pool = limit(concurrency);

  // canceling fetchPage aborts the underlying request via signal
  const fetchPage = cancelify(({ getSignal }, url: string) => site.fetchPage(url, getSignal()));

  const crawl = new CancelablePromise<CrawlReport>((resolve, reject, { handleCancel }) => {
    // cancel drains pool, aborting in-flight fetches and dropping queued ones
    handleCancel((reason) => pool.cancel(reason));

    const visited: string[] = [];
    const broken: string[] = [];

    const visit = async (url: string, depth: number): Promise<void> => {
      const page: Page = await pool(fetchPage, url);
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
    const reportAborted = api.calls.filter((call) => call.endpoint === 'site.page' && call.status === 'aborted').length;
    const reportNeverStarted = TOTAL_PAGES - reportStarted;
    console.log(
      `canc: crawl stopped, started = ${reportStarted}, in-flight aborted = ${reportAborted}, never started = ${reportNeverStarted}`,
    );
  }
}
