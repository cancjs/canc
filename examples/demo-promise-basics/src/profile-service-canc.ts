import { cancelify } from '@cancjs/toolbox';
import type { MockApiBundle } from '@shared/mock-api';

import type { Profile } from './profile';

type ProductsApi = MockApiBundle['products'];

/**
 * CancelablePromise, twin of loadProfile / loadProfileAbortable: one cancel() call stops the
 * underlying request. cancelify wires the cancel signal into the mock API call, no manual
 * AbortController. cancellation is just a rejection, regular catch works.
 */
export const loadProfileCancelable = cancelify(
  ({ getSignal }, [productsApi, userId]: [ProductsApi, string]): Promise<Profile> =>
    productsApi.get(userId, getSignal()),
);

// (no second flavor needed, cancellation is built in)
