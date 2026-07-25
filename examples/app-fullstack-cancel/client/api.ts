import cancelableAxios, { type CancelableAxiosInstance } from '@cancjs/axios';
import type { CancelablePromise } from '@cancjs/promise';

// One search hit as the client sees it. Mirrors the server's SearchHit but stays independent so the
// client does not import server code.
export interface UserHit {
  id: number;
  name: string;
  email: string;
  city: string;
  cityCount: number;
}

export interface SearchApi {
  /** Returns a CancelablePromise: call .cancel() to abort the request. */
  search(query: string): CancelablePromise<UserHit[]>;
}

/** A cancelable axios instance pointed at the API. Every request it makes can be canceled. */
export function createHttp(baseURL: string): CancelableAxiosInstance {
  return cancelableAxios.create({ baseURL });
}

/** The search API over a cancelable axios instance. The instance is injected so tests can supply a fake adapter. */
export function createApi(http: CancelableAxiosInstance): SearchApi {
  return {
    search(query: string): CancelablePromise<UserHit[]> {
      return http.get<UserHit[]>('/search', { params: { q: query } }).then((response) => response.data);
    },
  };
}
