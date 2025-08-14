import CancelablePromise from '@cancjs/promise';
import { retry } from '@cancjs/toolbox';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * Retries payment up to 3 times with exponential backoff using the toolbox retry utility
 * bound to CancelablePromise. cancel() stops backoff loops immediately and clears all
 * pending timers. No state update on unmounted component.
 */
export function chargeWithRetry(
 mockApi: MockApiBundle,
 paymentId: string
): Promise<string> {
 return retry(
 () => mockApi.payments.charge(paymentId),
 { retries: 3, minTimeout: 100, factor: 2, impl: CancelablePromise as any }
 );
}
