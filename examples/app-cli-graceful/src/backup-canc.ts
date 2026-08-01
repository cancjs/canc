import { cancAsync, cancAwait } from '@cancjs/coroutine';
import { CancelablePromise } from '@cancjs/promise';
import { cancelify } from '@cancjs/toolbox';
import { createPool } from '@shared/lib';

import { Manifest, ManifestEntry } from './manifest';
import { SiteApi } from './mock/site-api';

const CONCURRENCY = 3;

/**
 * Crawls the site and downloads every page + asset through the cancel-aware pool. `backupTask.
 * cancel()` stops every in-flight download and never starts a queued one; the manifest is written
 * into the shared `manifest` object instead of returned, because a canceled coroutine always
 * settles rejected (its own `finally` still runs, driven to completion, but a value returned past
 * that point is never observable) -- the caller reads `manifest` once `backupTask.cancel()` settles.
 */
export function runBackup(api: SiteApi, manifest: Manifest): CancelablePromise<void> {
  return cancAsync(function* () {
    const pages = api.crawl();
    const urls = [...pages.map((p) => p.url), ...pages.flatMap((p) => p.assets)];
    const downloadPool = createPool(CONCURRENCY);

    try {
      const downloadOne = cancelify(({ getSignal }, [url]: [string]) =>
        api.download(url, getSignal()).then(() => {
          manifest.entries.push({ url, status: 'saved' });
        }),
      ) as (url: string) => CancelablePromise<void>;

      const jobs = urls.map((url) => downloadPool.run(() => downloadOne(url)));
      yield* cancAwait(Promise.all(jobs));
    } finally {
      // shielded: canceled here -- drain the pool so every in-flight download stops and no queued
      // one starts, driven to completion regardless, so remaining urls are always marked queued in
      // the manifest before backupTask.cancel() settles in main-canc.ts
      downloadPool.cancelAll();
      const started = new Set(manifest.entries.map((e: ManifestEntry) => e.url));
      for (const url of urls) {
        if (!started.has(url)) manifest.entries.push({ url, status: 'queued' });
      }
      manifest.partial = started.size < urls.length;
    }
  })();
}
