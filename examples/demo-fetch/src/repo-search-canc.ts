import * as canc from '@cancjs/coroutine';
import { cancelableFetchFactory } from '@cancjs/fetch';
import { CancelablePromise } from '@cancjs/promise';
import { timeout } from '@cancjs/toolbox';

import { Repo } from './repo';

// Helper: factory-bound cancelable fetch for this module.
function createFetch(fetch: any) {
  return cancelableFetchFactory({ fetch });
}

function searchRepos(query: string, fetch: any): CancelablePromise<Repo> {
  const cancelableFetch = createFetch(fetch);

  // Chain: search → detail fetch. Canceling the coroutine cancels both legs.
  return canc.async(function* () {
    const searchRes = yield* canc.await(cancelableFetch('/products'));
    if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.status}`);
    const products = (yield* canc.await(searchRes.json())) as Array<{ id: string; name: string }>;

    if (!products.length) throw new Error('No items found');
    const top = products[0];

    // Fetch details of top hit. If chain is canceled now, this fetch aborts (cancel flows down).
    const detailRes = yield* canc.await(cancelableFetch(`/products/${top.id}`));
    if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
    const detail = yield* canc.await(detailRes.json());

    return { ...top, url: '', readme: JSON.stringify(detail) } as Repo;
  })();
}

// External signal: pass signal into fetch. Returns CancelablePromise chain.
function searchReposWithExternal(query: string, fetch: any, signal?: AbortSignal): CancelablePromise<Repo> {
  const cancelableFetch = createFetch(fetch);

  return canc.async(function* () {
    const searchRes = yield* canc.await(cancelableFetch('/products', { signal }));
    if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.status}`);
    const products = (yield* canc.await(searchRes.json())) as Array<{ id: string; name: string }>;

    if (!products.length) throw new Error('No items found');
    const top = products[0];

    // Fetch details with same signal. Cancel flows down to both legs.
    const detailRes = yield* canc.await(cancelableFetch(`/products/${top.id}`, { signal }));
    if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
    const detail = yield* canc.await(detailRes.json());

    return { ...top, url: '', readme: JSON.stringify(detail) } as Repo;
  })();
}

// Pre-aborted signal: promise born-canceled (no fetch starts).
function searchReposPreAborted(query: string, fetch: any): CancelablePromise<Repo> {
  // Demonstrates pre-aborted signal making fetch reject immediately on construction.
  const abortController = new AbortController();
  abortController.abort();

  const cancelableFetch = createFetch(fetch);

  return canc.async(function* () {
    yield* canc.await(
      cancelableFetch('/products/p1', {
        signal: abortController.signal,
      }),
    );
    return { id: 'p1', name: '', url: '', readme: '' };
  })();
}

// Timeout composition: race with timeout (stops underlying fetch if timeout wins).
function searchReposWithTimeout(query: string, fetch: any, timeoutMs = 100): CancelablePromise<Repo> {
  return timeout(searchRepos(query, fetch), timeoutMs) as CancelablePromise<Repo>;
}

export { searchRepos, searchReposPreAborted, searchReposWithExternal, searchReposWithTimeout };
