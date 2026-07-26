import cancelableAxios from '@cancjs/axios';
import type { CancelablePromise } from '@cancjs/promise';
import type { UserHit } from './user-hit';

const http = cancelableAxios.create({ baseURL: '/api' });

export interface SearchApi {
  search(query: string): CancelablePromise<UserHit[]>;
}

// search() returns a CancelablePromise: call .cancel() to abort the request. No signal in sight.
export const searchApi: SearchApi = {
  search: (query) => http.get<UserHit[]>('/search', { params: { q: query } }).then((res) => res.data),
};
