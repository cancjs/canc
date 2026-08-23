// Shared fake API for the canc examples (see README.md).

export type { AbortSignalLike, CallRecord, CallStatus, MockApiOptions } from './core';
export { MockApi } from './core';
export type {
  Album,
  ChatApi,
  Comment,
  DocChunk,
  Domains,
  Flight,
  Hotel,
  Invoice,
  InvoiceDetail,
  InvoiceLine,
  Issue,
  Order,
  PricePoint,
  Product,
  Quote,
  RagApi,
  SearchResult,
  Supplier,
  Track,
} from './domains';
export { createDomains } from './domains';
export type { MockAxiosAdapter, MockAxiosConfig, MockAxiosResponse } from './mock-axios';
export { createMockAxiosAdapter } from './mock-axios';
export type { MockFetch, MockFetchInit, MockResponse } from './mock-fetch';
export { createMockFetch } from './mock-fetch';

import { MockApi, MockApiOptions } from './core';
import { createDomains, Domains } from './domains';
import { createMockAxiosAdapter, MockAxiosAdapter } from './mock-axios';
import { createMockFetch, MockFetch } from './mock-fetch';

/** A MockApi plus every domain endpoint and the fetch/axios facades, wired to one call log. */
export interface MockApiBundle extends Domains {
  api: MockApi;
  fetch: MockFetch;
  axiosAdapter: MockAxiosAdapter;
}

/** One-call setup: returns a MockApi with all domains and the fetch/axios facades attached. */
export function createMockApi(options?: MockApiOptions): MockApiBundle {
  const api = new MockApi(options);
  return {
    api,
    ...createDomains(api),
    fetch: createMockFetch(api),
    axiosAdapter: createMockAxiosAdapter(api),
  };
}
