import CancelablePromise from '@cancjs/promise';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * Cleanup with suppress: one-liner to suppress cancel-family errors while preserving real
 * errors. Declarative, easier to reason about, and hard to get wrong.
 * The suppress(['cancel', 'abort']) call swallows both CancelError and AbortError.
 */
export function cleanupPaymentRecord(
 mockApi: MockApiBundle,
 recordId: string
): CancelablePromise<void> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 mockApi.payments.cleanup(recordId).then(resolve, reject);
 }).suppress(['cancel', 'abort']);
}
