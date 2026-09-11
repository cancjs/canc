// An axios-adapter-shaped facade over the fake API.


import { AbortSignalLike, MockApi } from './core';
import { createMockFetch } from './mock-fetch';

export interface MockAxiosConfig {
  url?: string;
  method?: string;
  baseURL?: string;
  signal?: AbortSignalLike;
  params?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
}

export interface MockAxiosResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  config: MockAxiosConfig;
  headers: Record<string, string>;
  request?: unknown;
}

export type MockAxiosAdapter = (config: MockAxiosConfig) => Promise<MockAxiosResponse>;

/**
 * Builds an axios adapter bound to a MockApi. Reuses the mockFetch router for path handling. On
 * abort it rejects with an AbortError (axios surfaces this as a canceled request); non-2xx
 * responses reject with an Error carrying the status, matching axios's default validateStatus.
 */

export function createMockAxiosAdapter(api: MockApi): any {
  const mockFetch = createMockFetch(api);

  return async function mockAxiosAdapter(config: MockAxiosConfig) {
    let url = `${config.baseURL ?? ''}${config.url ?? ''}`;
    if (config.params) {
      const searchParams = new URLSearchParams(config.params as Record<string, string>).toString();
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
