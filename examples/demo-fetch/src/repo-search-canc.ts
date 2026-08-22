import * as canc from '@cancjs/coroutine';
import { cancelableFetchFactory } from '@cancjs/fetch';
import { CancelablePromise, createCancelSignal } from '@cancjs/promise';
import { timeout } from '@cancjs/toolbox';

import { Repo } from './repo';

// Helper: factory-bound cancelable fetch for this module.
function createFetch(fetch: any) {
  return cancelableFetchFactory({ fetch });
}

function searchRepos(query: string, fetch: any): CancelablePromise<Repo, any> {
  const cancelableFetch = createFetch(fetch);

  // Chain: search then detail fetch. Canceling the coroutine cancels both legs.
  return canc.async(function* () {
    const searchRes = yield* canc.await(cancelableFetch('/products'));
    if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.status}`);
    const products = (yield* canc.await(searchRes.json())) as Array<{ id: string; name: string }>;

    if (!products.length) throw new Error('No items found');
    const top = products[0];

    // canceled here: nothing below runs
    const detailRes = yield* canc.await(cancelableFetch(`/products/${top.id}`));
    if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
    const detail = yield* canc.await(detailRes.json());

    return { ...top, url: '', readme: JSON.stringify(detail) } as Repo;
  })();
}

// External signal: pass signal into fetch. Returns CancelablePromise chain.
function searchReposWithExternal(query: string, fetch: any, signal?: AbortSignal): CancelablePromise<Repo, any> {
  const cancelableFetch = createFetch(fetch);

  return canc.async(function* () {
    const searchRes = yield* canc.await(cancelableFetch('/products', { signal }));
    if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.status}`);
    const products = (yield* canc.await(searchRes.json())) as Array<{ id: string; name: string }>;

    if (!products.length) throw new Error('No items found');
    const top = products[0];

    // If aborted here, network request stops.
    const detailRes = yield* canc.await(cancelableFetch(`/products/${top.id}`, { signal }));
    if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
    const detail = yield* canc.await(detailRes.json());

    return { ...top, url: '', readme: JSON.stringify(detail) } as Repo;
  })();
}

// Pre-aborted signal: promise born-canceled (no fetch starts).
function searchReposPreAborted(query: string, fetch: any): CancelablePromise<Repo, any> {
  // Demonstrates pre-aborted signal making fetch reject immediately on construction.
  const cancelSignal = createCancelSignal('pre-aborted');
  cancelSignal.cancel();

  const cancelableFetch = createFetch(fetch);

  return canc.async(function* () {
    yield* canc.await(
      cancelableFetch('/products/p1', {
        signal: cancelSignal.signal,
      }),
    );
    return { id: 'p1', name: '', url: '', readme: '' } as Repo;
  })();
}

// Timeout composition: race with timeout (stops underlying fetch if timeout wins).
function searchReposWithTimeout(query: string, fetch: any, timeoutMs = 100): CancelablePromise<Repo, any> {
  return timeout(searchRepos(query, fetch), timeoutMs) as CancelablePromise<Repo, any>;
}

export { searchRepos, searchReposPreAborted, searchReposWithExternal, searchReposWithTimeout };
