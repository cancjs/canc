// Shared fake API for the canc examples. This is example scaffolding, not a library to copy: it
// exists so demos can prove a cancel() actually reached a simulated network call (see the
// started/aborted markers in `mockApi.calls`). See README.md.

export { MockApi } from './core';
export type { CallRecord, CallStatus, MockApiOptions, AbortSignalLike } from './core';

export { createDomains } from './domains';
export type {
 Domains,
 Product,
 Order,
 Flight,
 Supplier,
 Quote,
 Track,
 Album,
 Invoice,
 Hotel,
 PricePoint,
 Issue,
 DocChunk,
 RagApi,
 ChatApi,
} from './domains';

export { createMockFetch } from './mock-fetch';
export type { MockFetch, MockFetchInit, MockResponse } from './mock-fetch';

export { createMockAxiosAdapter } from './mock-axios';
export type { MockAxiosAdapter, MockAxiosConfig, MockAxiosResponse } from './mock-axios';

import { MockApi, MockApiOptions } from './core';
import { createDomains, Domains } from './domains';
import { createMockFetch, MockFetch } from './mock-fetch';
import { createMockAxiosAdapter, MockAxiosAdapter } from './mock-axios';

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
