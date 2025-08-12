import { CancelablePromise } from '@cancjs/promise';
import { cancelableFetchFactory } from '@cancjs/fetch';
import { timeout } from '@cancjs/toolbox';
import { Repo } from './repo';

// Helper: factory-bound cancelable fetch for this module.
function createFetch(fetch: any) {
 return cancelableFetchFactory({ fetch });
}

function searchRepos(query: string, fetch: any): CancelablePromise<Repo> {
 const cancelableFetch = createFetch(fetch);

 // Chain: search → detail fetch. Canceling the chain cancels both legs.
 return cancelableFetch(`/products`)
 .then((res) => {
 if (!res.ok) throw new Error(`Search failed: ${res.status}`);
 return res.json() as Promise<Array<{ id: string; name: string }>>;
 })
 .then((products) => {
 if (!products.length) throw new Error('No items found');
 const top = products[0];

 // Fetch details of top hit. If chain is canceled now, this fetch aborts (cancel flows down).
 return cancelableFetch(`/products/${top.id}`)
 .then((detailRes) => {
 if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
 return detailRes.json() as Promise<any>;
 })
 .then((detail) => {
 return { ...top, url: '', readme: JSON.stringify(detail) } as Repo;
 });
 }) as CancelablePromise<Repo>;
}

// External signal: pass signal into fetch.
async function searchReposWithExternal(
 query: string,
 fetch: any,
 signal?: AbortSignal
): Promise<Repo> {
 const cancelableFetch = createFetch(fetch);

 const products = await cancelableFetch(`/products`)
 .then((res) => {
 if (!res.ok) throw new Error(`Search failed: ${res.status}`);
 return res.json() as Promise<Array<{ id: string; name: string }>>;
 })
 .then((products) => {
 if (!products.length) throw new Error('No items found');
 return products;
 });

 const top = products[0];

 const detailRes = await cancelableFetch(`/products/${top.id}`, { signal });
 if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
 const detail = await detailRes.json() as any;

 return { ...top, url: '', readme: JSON.stringify(detail) } as Repo;
}

// Pre-aborted signal: promise born-canceled (no fetch starts).
async function searchReposPreAborted(query: string, fetch: any): Promise<Repo> {
 const abortController = new AbortController();
 abortController.abort();

 const cancelableFetch = createFetch(fetch);

 // When signal is pre-aborted, the fetch rejects before starting.
 const detailRes = await cancelableFetch(`/products/p1`, {
 signal: abortController.signal,
 });
 return { id: 'p1', name: '', url: '', readme: '' };
}

// Timeout composition: race with timeout (stops underlying fetch if timeout wins).
async function searchReposWithTimeout(query: string, fetch: any, timeoutMs = 100): Promise<Repo> {
 const cancelableFetch = createFetch(fetch);

 const promise = (async () => {
 const products = await cancelableFetch(`/products`)
 .then((res) => {
 if (!res.ok) throw new Error(`Search failed: ${res.status}`);
 return res.json() as Promise<Array<{ id: string; name: string }>>;
 })
 .then((products) => {
 if (!products.length) throw new Error('No items found');
 return products;
 });

 const top = products[0];

 const detailRes = await cancelableFetch(`/products/${top.id}`);
 if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
 const detail = await detailRes.json() as any;

 return { ...top, url: '', readme: JSON.stringify(detail) } as Repo;
 })();

 // timeout() cancels the underlying promise if ms elapses (canceled here → fetch aborts).
 return timeout(promise, timeoutMs);
}

export { searchRepos, searchReposWithExternal, searchReposPreAborted, searchReposWithTimeout };
