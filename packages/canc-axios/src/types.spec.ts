import type { CancelablePromise } from '@cancjs/promise';
import type { AxiosInstance, AxiosResponse } from 'axios';
import axios from 'axios';

import { wrapAxios } from './base';
import type { CancelableAxiosInstance } from './types';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

interface Issue {
  id: number;
  title: string;
}

declare const api: CancelableAxiosInstance;

// A wrapped instance goes anywhere an axios instance goes: CancelablePromise extends Promise, and
// everything else mirrors the axios shape.
function assignability(): AxiosInstance {
  const asAxios: AxiosInstance = api;

  return asAxios;
}

// The response is the whole AxiosResponse, and the request generic still drives its data type.
type GetResult = ReturnType<typeof api.get<Issue>>;
type PostResult = ReturnType<typeof api.post<Issue>>;
type RequestResult = ReturnType<typeof api.request<Issue>>;
type CreateResult = ReturnType<typeof api.create>;

export type Assertions = [
  Expect<Equal<GetResult, CancelablePromise<AxiosResponse<Issue>>>>,
  Expect<Equal<PostResult, CancelablePromise<AxiosResponse<Issue>>>>,
  Expect<Equal<RequestResult, CancelablePromise<AxiosResponse<Issue>>>>,
  Expect<Equal<CreateResult, CancelableAxiosInstance>>,
];

it('wraps an axios instance into the cancelable shape', () => {
  const wrapped = wrapAxios(axios.create());

  expect(typeof wrapped.request).toBe('function');
  expect(typeof assignability).toBe('function');
});
