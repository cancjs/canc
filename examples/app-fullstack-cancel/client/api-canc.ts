import cancelableAxios from '@cancjs/axios';
import type { CancelablePromise } from '@cancjs/promise';

import type { UserHit } from './user-hit';

const http = cancelableAxios.create({ baseURL: '/api' });

export interface SearchApi {
  search(query: string): CancelablePromise<UserHit[]>;
}

// returns CancelablePromise without threading signals
export const searchApi: SearchApi = {
  search: (query) => http.get<UserHit[]>('/search', { params: { q: query } }).then((res) => res.data),
};
