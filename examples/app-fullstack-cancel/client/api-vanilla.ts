import axios from 'axios';

import type { UserHit } from './user-hit';

const http = axios.create({ baseURL: '/api' });

export interface SearchApi {
  search(query: string, signal: AbortSignal): Promise<UserHit[]>;
}

// search() takes an AbortSignal the caller must create, thread, and abort by hand.
export const searchApi: SearchApi = {
  search: (query, signal) => http.get<UserHit[]>('/search', { params: { q: query }, signal }).then((res) => res.data),
};
