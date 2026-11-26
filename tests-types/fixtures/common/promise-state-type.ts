import type { TCancelablePromiseStates } from '@cancjs/promise';

import type { Assert, Eq } from './assert-type';

type _states = Assert<
  Eq<TCancelablePromiseStates, 'PENDING' | 'FORCE_PENDING' | 'FULFILLED' | 'REJECTED' | 'CANCELED'>
>;
