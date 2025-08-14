// Crawl a site depth-2, reporting broken (404) links, with a hand-rolled cancellation attempt.
//
// Every page fetch runs through a plain concurrency queue. Cancellation is threaded by hand: each
// crawl level owns an AbortController and the queue tracks controllers so Stop can abort them. It
// still leaks: a queued fetch has no controller yet, so draining the queue cannot abort what has
// not started, and deeper fetches dispatched a tick before Stop already left with their own signal.

import { sleep } from '@shared/util';
import { createSiteApi, HOME_URL, type Page } from './mock/site';
import type { CrawlReport } from './types';
import type { MockApi } from '@shared/mock-api';

// A minimal concurrency queue. It collects the controllers of running jobs so a caller can try to
// abort them, but a queued job has no controller yet, so it cannot be aborted before it starts.
function createQueue(limit: number) {
 let active = 0;
 const waiting: Array<() => void> = [];
 const running = new Set<AbortController>();
 const pump = () => {
 while (active < limit && waiting.length > 0) waiting.shift()?.();
 };
 const next = () => {
 active--;
 pump();
 };
 const run = <T>(job: (signal: AbortSignal) => Promise<T>): Promise<T> =>
 new Promise<T>((resolve, reject) => {
 const start = () => {
 active++;
 const controller = new AbortController();
 running.add(controller);
 job(controller.signal)
 .then(resolve, reject)
 .finally(() => {
 running.delete(controller);
 next();
 });
 };
 // no cancel-while-queued path, a queued job always runs eventually once it gets a slot
 waiting.push(start);
 pump();
 });
 const abortRunning = () => {
 for (const controller of running) controller.abort();
 running.clear();
 };
 return { run, abortRunning };
}

/** Runs a depth-2 site-health crawl with a best-effort abort path. */
export function crawlSite(api: MockApi, concurrency: number): { result: Promise<CrawlReport>; cancel: () => void } {
 const site = createSiteApi(api);
 const queue = createQueue(concurrency);

 const visited: string[] = [];
 const broken: string[] = [];

 const visit = async (url: string, depth: number): Promise<void> => {
 const page: Page = await queue.run((signal) => site.fetchPage(url, signal));
 visited.push(url);
 if (page.status === 404) broken.push(url);
 if (depth > 0) await Promise.all(page.links.map((link) => visit(link, depth - 1)));
 };

 const result = visit(HOME_URL, 2).then(() => ({ visited, broken }));
 // Aborts only what is running now. Queued pages have no controller so they still start, and the
 // fetches dispatched a tick before this call keep running (grandchildren leak).
 const cancel = () => queue.abortRunning();

 return { result, cancel };
}

export async function crawlVanilla(api: MockApi): Promise<void> {
 console.log('vanilla: crawling site depth-2');
 const { result, cancel } = crawlSite(api, 4);

 // The operator hits Stop while the crawl is deep into fanning out (grandchildren in flight).
 setTimeout(cancel, 40);

 // Aborting running fetches makes the crawl reject, but the fetches already dispatched keep going.
 await result.catch(() => {});
 // Wait for the leaked fetches to land in the log, proving Stop did not actually stop the crawl.
 await sleep(120);

 const reportStarted = api.calls.filter((call) => call.endpoint === 'site.page').length;
 const reportCompleted = api.calls.filter(
 (call) => call.endpoint === 'site.page' && call.status === 'completed'
 ).length;
 console.log(`vanilla: page fetches started = ${reportStarted}, completed = ${reportCompleted} (queued and in-flight pages still ran)`);
}
