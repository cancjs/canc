// An axios-adapter-shaped facade over the fake API.

import { AbortSignalLike, MockApi } from './core';
import { createMockFetch } from './mock-fetch';

export interface MockAxiosConfig {
  url?: string;
  method?: string;
  baseURL?: string;
  signal?: AbortSignalLike;
  [key: string]: any;
}

export interface MockAxiosResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  config: any;
  headers: any;
  request?: any;
}

export type MockAxiosAdapter = (config: any) => Promise<MockAxiosResponse>;

/**
 * Builds an axios adapter bound to a MockApi. Reuses the mockFetch router for path handling. On
 * abort it rejects with an AbortError (axios surfaces this as a canceled request); non-2xx
 * responses reject with an Error carrying the status, matching axios's default validateStatus.
 */
export function createMockAxiosAdapter(api: MockApi): MockAxiosAdapter {
  const mockFetch = createMockFetch(api);

  return async function mockAxiosAdapter(config) {
    let url = `${config.baseURL ?? ''}${config.url ?? ''}`;
    if (config.params) {
      const searchParams = new URLSearchParams(config.params).toString();
      if (searchParams) {
        url += (url.includes('?') ? '&' : '?') + searchParams;
      }
    }
    // On abort, mockFetch rejects with an AbortError that propagates straight to the caller.
    const response = await mockFetch(url, { method: config.method, signal: config.signal });

    const data = await response.json();
    if (!response.ok) {
      const err = new Error(`Request failed with status code ${response.status}`);
      throw Object.assign(err, { response: { status: response.status, data } });
    }

    return {
      data,
      status: response.status,
      statusText: response.ok ? 'OK' : 'Error',
      config,
      headers: { 'content-type': 'application/json' },
    };
  };
}
