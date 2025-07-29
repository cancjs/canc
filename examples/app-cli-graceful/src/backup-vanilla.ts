import { SiteApi } from './mock/site-api';
import { Manifest } from './manifest';

const CONCURRENCY = 3;

/**
 * Crawls the site and downloads every page + asset, plain promises only. There is no
 * cancellation primitive here: the caller can only set a flag and check it between steps, so
 * work already handed to `download` keeps running even after the flag flips.
 */
export async function runBackup(
 api: SiteApi,
 manifest: Manifest,
 isAborted: () => boolean
): Promise<void> {
 const pages = api.crawl();
 const urls = [...pages.map((p) => p.url), ...pages.flatMap((p) => p.assets)];

 let nextIndex = 0;

 const runOne = async (): Promise<void> => {
 while (nextIndex < urls.length) {
 // checked before starting the next url, but a url already in flight below is not stoppable
 if (isAborted()) {
 // remaining urls never started -- marked queued in the partial manifest
 while (nextIndex < urls.length) {
 manifest.entries.push({ url: urls[nextIndex++], status: 'queued' });
 }
 return;
 }
 const url = urls[nextIndex++];
 try {
 await api.download(url);
 // keeps running after the user asked to stop -- wasted work if isAborted flipped mid-await
 manifest.entries.push({ url, status: isAborted() ? 'aborted' : 'saved' });
 } catch {
 manifest.entries.push({ url, status: 'aborted' });
 }
 }
 };

 const workers = Array.from({ length: CONCURRENCY }, () => runOne());
 await Promise.all(workers);

 manifest.partial = isAborted();
}
