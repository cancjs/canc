import type CancelablePromise from '@cancjs/promise';
import { cancelify, retry } from '@cancjs/toolbox';
import type { MockApiBundle } from '@shared/mock-api';

type PaymentsApi = MockApiBundle['payments'];

/**
 * Retries payment up to 3 times after the first attempt, so 4 calls at most, with exponential
 * backoff of 100ms, 200ms and 400ms, using the toolbox retry utility, which is bound to
 * CancelablePromise. cancel() clears pending backoff and aborts an active mock API
 * request through the signal-aware boundary. A completed charge cannot be undone.
 */
export function chargeWithRetry(paymentsApi: PaymentsApi, paymentId: string): CancelablePromise<string, unknown> {
  const charge = cancelify(({ getSignal }, id: string) => paymentsApi.charge(id, getSignal()));

  return retry(() => charge(paymentId), { retries: 3, initialDelay: 100, factor: 2 });
}
