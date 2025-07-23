import CancelablePromise from '@cancjs/promise';
import { Profile } from './profile';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * CancelablePromise: one cancel() call stops the underlying request. The handleCancel
 * callback wires the cancellation signal down to the mock API (or any AbortSignal-aware call).
 * cancellation is just a rejection — regular catch works.
 */
export function loadProfile(mockApi: MockApiBundle, userId: string): CancelablePromise<Profile> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 mockApi.products.get(userId, controller.signal).then(resolve, reject);
 });
}

// (no second flavor needed — cancellation is built in)
