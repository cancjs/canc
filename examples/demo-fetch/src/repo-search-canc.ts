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
 return new CancelablePromise(async (resolve, reject, handleCancel) => {
 const searchPromise = cancelableFetch(`/products`);
 let detailPromise: CancelablePromise<any> | null = null;

 handleCancel(() => {
 searchPromise.cancel();
 if (detailPromise) detailPromise.cancel();
 });

 try {
 const searchRes = await searchPromise;
 if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.status}`);
 const products = await searchRes.json() as Array<{ id: string; name: string }>;

 if (!products.length) throw new Error('No items found');
 const top = products[0];

 // Fetch details of top hit. If chain is canceled now, this fetch aborts (cancel flows down).
 detailPromise = cancelableFetch(`/products/${top.id}`);
 const detailRes = await detailPromise;
 if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
 const detail = await detailRes.json() as any;

 resolve({ ...top, url: '', readme: JSON.stringify(detail) } as Repo);
 } catch (err) {
 reject(err);
 }
 });
}

// External signal: pass signal into fetch. Returns CancelablePromise chain.
function searchReposWithExternal(
 query: string,
 fetch: any,
 signal?: AbortSignal
): CancelablePromise<Repo> {
 const cancelableFetch = createFetch(fetch);

 return new CancelablePromise(async (resolve, reject, handleCancel) => {
 try {
 const searchRes = await cancelableFetch(`/products`, { signal });
 if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.status}`);
 const products = await searchRes.json() as Array<{ id: string; name: string }>;

 if (!products.length) throw new Error('No items found');
 const top = products[0];

 // Fetch details with same signal. Cancel flows down to both legs.
 const detailRes = await cancelableFetch(`/products/${top.id}`, { signal });
 if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
 const detail = await detailRes.json() as any;

 resolve({ ...top, url: '', readme: JSON.stringify(detail) } as Repo);
 } catch (err) {
 reject(err);
 }
 });
}

// Pre-aborted signal: promise born-canceled (no fetch starts).
function searchReposPreAborted(query: string, fetch: any): CancelablePromise<Repo> {
 const abortController = new AbortController();
 abortController.abort();

 const cancelableFetch = createFetch(fetch);

 return new CancelablePromise(async (resolve, reject, handleCancel) => {
 try {
 // When signal is pre-aborted, the fetch rejects before starting.
 await cancelableFetch(`/products/p1`, {
 signal: abortController.signal,
 });
 resolve({ id: 'p1', name: '', url: '', readme: '' });
 } catch (err) {
 reject(err);
 }
 });
}

// Timeout composition: race with timeout (stops underlying fetch if timeout wins).
function searchReposWithTimeout(query: string, fetch: any, timeoutMs = 100): CancelablePromise<Repo> {
 const cancelableFetch = createFetch(fetch);

 const promise = new CancelablePromise<Repo>(async (resolve, reject, handleCancel) => {
 const searchPromise = cancelableFetch(`/products`);
 let detailPromise: CancelablePromise<any> | null = null;

 handleCancel(() => {
 searchPromise.cancel();
 if (detailPromise) detailPromise.cancel();
 });

 try {
 const searchRes = await searchPromise;
 if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.status}`);
 const products = await searchRes.json() as Array<{ id: string; name: string }>;

 if (!products.length) throw new Error('No items found');
 const top = products[0];

 // Fetch details of top hit.
 detailPromise = cancelableFetch(`/products/${top.id}`);
 const detailRes = await detailPromise;
 if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
 const detail = await detailRes.json() as any;

 resolve({ ...top, url: '', readme: JSON.stringify(detail) } as Repo);
 } catch (err) {
 reject(err);
 }
 });

 // timeout() cancels the underlying promise if ms elapses (canceled here → fetch aborts).
 return timeout(promise, timeoutMs) as CancelablePromise<Repo>;
}

export { searchRepos, searchReposWithExternal, searchReposPreAborted, searchReposWithTimeout };
