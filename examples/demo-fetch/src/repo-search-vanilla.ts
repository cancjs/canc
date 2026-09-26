import { Repo } from './repo';

// Uncancelable: plain fetch, no workaround. Results are fetched but discarded
// when the chain is abandoned externally (the bug we teach).
async function searchRepos(query: string, fetch: any): Promise<Repo> {
  // Mock endpoint: /products (list endpoint) returns items.
  const res = await fetch(`/products`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const products = (await res.json()) as Array<{ id: string; name: string }>;
  if (!products.length) throw new Error('No items found');
  const top = products[0];

  // keeps running after the user left (wasted work)
  const detailRes = await fetch(`/products/${top.id}`);
  if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
  const detail = (await detailRes.json()) as any;
  return { ...top, url: '', readme: JSON.stringify(detail) } as Repo;
}

// Workaround: manual AbortController signal plumbing. External signal combined
// with local timeout — count the boilerplate.
async function searchReposWithExternal(query: string, fetch: any, signal?: AbortSignal): Promise<Repo> {
  const controller = new AbortController();
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

  const res = await fetch(`/products`, {
    signal: combinedSignal,
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  const products = (await res.json()) as Array<{ id: string; name: string }>;
  const top = products[0];
  if (!top) throw new Error('No items found');

  // If aborted here, network request stops.
  const detailRes = await fetch(`/products/${top.id}`, {
    signal: combinedSignal,
  });
  if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
  const detail = (await detailRes.json()) as any;
  return { ...top, url: '', readme: JSON.stringify(detail) } as Repo;
}

async function searchReposPreAborted(query: string, fetch: any): Promise<Repo> {
  const controller = new AbortController();
  controller.abort();

  await fetch('/products/p1', {
    signal: controller.signal,
  });
  return { id: 'p1', name: '', url: '', readme: '' } as Repo;
}

async function searchReposWithTimeout(query: string, fetch: any, timeoutMs = 100): Promise<Repo> {
  const controller = new AbortController();
  let timeoutId: any;

  // Timeout logic.
  if (timeoutMs !== Infinity) {
    timeoutId = setTimeout(() => {
      controller.abort(new Error('Timeout'));
    }, timeoutMs);
  }

  try {
    const res = await fetch(`/products`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const products = (await res.json()) as Array<{ id: string; name: string }>;
    const top = products[0];
    if (!top) throw new Error('No items found');

    const detailRes = await fetch(`/products/${top.id}`, {
      signal: controller.signal,
    });
    if (!detailRes.ok) throw new Error(`Detail fetch failed: ${detailRes.status}`);
    const detail = (await detailRes.json()) as any;
    return { ...top, url: '', readme: JSON.stringify(detail) } as Repo;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export { searchRepos, searchReposPreAborted, searchReposWithExternal, searchReposWithTimeout };
