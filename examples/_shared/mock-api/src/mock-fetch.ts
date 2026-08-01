// A fetch-shaped facade over the fake API, for demos that inject a custom fetch into the
// @cancjs/fetch factory. It reads the URL path, routes to a domain endpoint, and honors
// `init.signal` the same way a real fetch does (rejecting with an AbortError on abort).
//
// Only the members the examples touch are implemented; this is not a spec-complete Response.

import { AbortSignalLike, MockApi } from './core';
import { createDomains } from './domains';

export interface MockResponse {
  ok: boolean;
  status: number;
  url: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export interface MockFetchInit {
  method?: string;
  signal?: AbortSignalLike;
}

export type MockFetch = (
  input: string | { url: string; signal?: AbortSignalLike },
  init?: MockFetchInit,
) => Promise<MockResponse>;

/**
 * Builds a fetch-shaped function bound to a MockApi. Supported routes (GET):
 * /products, /products/:id, /orders, /flights?from=&to=, /invoices, /invoices/:id, /hotels?city=
 * Unknown routes resolve to a 404 MockResponse; aborts reject with an AbortError.
 */
export function createMockFetch(api: MockApi): MockFetch {
  const domains = createDomains(api);

  return async function mockFetch(input, init) {
    const rawUrl = typeof input === 'string' ? input : input.url;
    const signal = init?.signal ?? (typeof input === 'object' ? input.signal : undefined);
    const url = new URL(rawUrl, 'http://mock.local');
    const path = url.pathname.replace(/\/+$/, '');
    const segments = path.split('/').filter(Boolean);

    const data = await route(domains, segments, url, signal);
    if (data === NOT_FOUND) {
      return makeResponse(rawUrl, 404, { error: 'not found', path });
    }
    return makeResponse(rawUrl, 200, data);
  };
}

const NOT_FOUND = Symbol('not-found');

function route(
  domains: ReturnType<typeof createDomains>,
  segments: string[],
  url: URL,
  signal?: AbortSignalLike,
): Promise<unknown> | typeof NOT_FOUND {
  const [head, id] = segments;
  switch (head) {
    case 'products':
      return id ? domains.products.get(id, signal) : domains.products.list(signal);
    case 'orders':
      return domains.orders.list(signal);
    case 'flights':
      return domains.flights.search(url.searchParams.get('from') ?? '', url.searchParams.get('to') ?? '', signal);
    case 'invoices':
      return id ? domains.invoices.get(id, signal) : domains.invoices.list(signal);
    case 'hotels':
      return domains.hotels.search(url.searchParams.get('city') ?? '', signal);
    default:
      return NOT_FOUND;
  }
}

function makeResponse(url: string, status: number, body: unknown): MockResponse {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text),
  };
}
