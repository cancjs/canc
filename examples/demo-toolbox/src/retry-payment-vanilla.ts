import type { MockApiBundle } from '@shared/mock-api';

type PaymentsApi = MockApiBundle['payments'];

/**
 * Retries payment up to 3 times with exponential backoff. Plain promise: if the caller cancels
 * mid-backoff, the next attempt still runs (state update on unmounted component, wasted work).
 * Requires a separate AbortController/flag to cancel the retry loop from outside.
 */
export function chargeWithRetry(paymentsApi: PaymentsApi, paymentId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryCharge = () => {
      attempt++;
      paymentsApi.charge(paymentId).then(resolve, (err) => {
        if (attempt < 3) {
          const delay = Math.pow(2, attempt) * 100;
          setTimeout(tryCharge, delay);
        } else {
          reject(err);
        }
      });
    };
    tryCharge();
  });
}
