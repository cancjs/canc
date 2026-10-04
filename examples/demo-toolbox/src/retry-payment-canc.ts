import type CancelablePromise from '@cancjs/promise';
import { retry } from '@cancjs/toolbox';
import type { MockApiBundle } from '@shared/mock-api';

type PaymentsApi = MockApiBundle['payments'];

/**
 * Retries payment up to 3 times after the first attempt, so 4 calls at most, with exponential
 * backoff of 100ms, 200ms and 400ms, using the toolbox retry utility, which is bound to
 * CancelablePromise. cancel() stops backoff loops immediately and clears all pending timers.
 * No state update on unmounted component.
 */
export function chargeWithRetry(paymentsApi: PaymentsApi, paymentId: string): CancelablePromise<string, unknown> {
  return retry(() => paymentsApi.charge(paymentId), { retries: 3, initialDelay: 100, factor: 2 });
}
