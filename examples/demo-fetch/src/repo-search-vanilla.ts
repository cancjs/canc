import { Repo } from './repo';

// Uncancelable: plain fetch, no workaround. Results are fetched but discarded
// when the chain is abandoned externally (the bug we teach).
async function searchRepos(query: string, fetch: any): Promise<Repo> {
 // Mock endpoint: /products (list endpoint) returns items.
 const res = await fetch(`/products`);
 if (!res.ok) throw new Error(`Search failed: ${res.status}`);
 const products = await res.json() as Array<{ id: string; name: string }>;
 const top = products[0];
 if (!top) throw new Error('No items found');

 // Fetch details of top hit. If caller cancels now, this completes anyway (wasted work).
 const detailRes = await fetch(`/products/${top.id}`);
 if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
 const detail = await detailRes.json() as any;
 return { ...top, url: '', readme: JSON.stringify(detail) } as Repo;
}

// Workaround: manual AbortController signal plumbing. External signal combined
// with local timeout — count the boilerplate.
async function searchReposAbortable(
 query: string,
 fetch: any,
 signal?: AbortSignal,
 timeoutMs = Infinity
): Promise<Repo> {
 const controller = new AbortController();
 let timeoutId: any;
 let localAborted = false;

 const combinedSignal = signal || controller.signal;

 // Attach external signal abort listener (if available).
 if (signal && typeof signal.addEventListener === 'function') {
 signal.addEventListener('abort', () => {
 if (!localAborted) {
 localAborted = true;
 controller.abort(signal.reason);
 }
 });
 }

 // Timeout logic.
 if (timeoutMs !== Infinity) {
 timeoutId = setTimeout(() => {
 if (!localAborted) {
 localAborted = true;
 controller.abort(new Error('Timeout'));
 }
 }, timeoutMs);
 }

 try {
 const res = await fetch(`/products`, {
 signal: combinedSignal,
 });
 if (!res.ok) throw new Error(`Search failed: ${res.status}`);
 const products = await res.json() as Array<{ id: string; name: string }>;
 const top = products[0];
 if (!top) throw new Error('No items found');

 // Fetch details. If aborted here, network request stops.
 const detailRes = await fetch(`/products/${top.id}`, {
 signal: combinedSignal,
 });
 if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
 const detail = await detailRes.json() as any;
 return { ...top, url: '', readme: JSON.stringify(detail) } as Repo;
 } finally {
 if (timeoutId) clearTimeout(timeoutId);
 }
}

export { searchRepos, searchReposAbortable };
