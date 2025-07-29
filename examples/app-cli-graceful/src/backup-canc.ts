import { CancelablePromise } from '@cancjs/promise';
import { cancAsync, cancAwait } from '@cancjs/coroutine';
import { SiteApi } from './mock/site-api';
import { Manifest, ManifestEntry } from './manifest';
import { pool } from './lib/pool';

const CONCURRENCY = 3;

/**
 * Crawls the site and downloads every page + asset through the cancel-aware pool. `root.cancel()`
 * stops every in-flight download and never starts a queued one; the manifest is written into the
 * shared `manifest` object instead of returned, because a canceled coroutine always settles
 * rejected (its own `finally` still runs, driven to completion, but a value returned past that
 * point is never observable) -- the caller reads `manifest` once `root.cancel()` settles.
 */
export function runBackup(api: SiteApi, manifest: Manifest): CancelablePromise<void> {
 return cancAsync(function* () {
 const pages = api.crawl();
 const urls = [...pages.map((p) => p.url), ...pages.flatMap((p) => p.assets)];

 try {
 const downloadOne = (url: string): CancelablePromise<void> =>
 new CancelablePromise((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 api.download(url, controller.signal).then(
 () => {
 manifest.entries.push({ url, status: 'saved' });
 resolve();
 },
 (error) => reject(error)
 );
 });

 yield* cancAwait(pool(urls, CONCURRENCY, downloadOne));
 } finally {
 // shielded: canceled here -- driven to completion regardless, so remaining urls are always
 // marked queued in the manifest before root.cancel() settles in main-canc.ts
 const started = new Set(manifest.entries.map((e: ManifestEntry) => e.url));
 for (const url of urls) {
 if (!started.has(url)) manifest.entries.push({ url, status: 'queued' });
 }
 manifest.partial = started.size < urls.length;
 }
 })() as CancelablePromise<void>;
}
