import type { MockApiBundle } from '@shared/mock-api';

type PaymentsApi = MockApiBundle['payments'];

/**
 * Retries payment up to 3 times after the first attempt, so 4 calls at most, with exponential
 * backoff of 100ms, 200ms and 400ms. Plain promise: if the caller cancels mid-backoff, the next
 * attempt still runs (state update on unmounted component, wasted work).
 * Requires a separate AbortController/flag to cancel the retry loop from outside.
 */
export function chargeWithRetry(paymentsApi: PaymentsApi, paymentId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryCharge = () => {
      attempt++;
      paymentsApi.charge(paymentId).then(resolve, (err) => {
        if (attempt <= 3) {
          const delay = Math.pow(2, attempt - 1) * 100;
          setTimeout(tryCharge, delay);
        } else {
          reject(err);
        }
      });
    };
    tryCharge();
  });
}

/**
 * Manually aborts the current payment request and cancels any scheduled retry.
 * A new controller is required for every attempt.
 */
export function chargeWithRetryAbortable(
  paymentsApi: PaymentsApi,
  paymentId: string,
): { promise: Promise<string>; cancel(): void } {
  let attempts = 0;
  let stopped = false;
  let settled = false;
  let controller: AbortController | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let rejectOuter!: (error: Error) => void;

  const promise = new Promise<string>((resolve, reject) => {
    rejectOuter = reject;
    const tryCharge = () => {
      if (stopped) return;

      attempts++;
      controller = new AbortController();
      paymentsApi.charge(paymentId, controller.signal).then(
        (value) => {
          if (stopped) return;
          settled = true;
          resolve(value);
        },
        (error: unknown) => {
          if (stopped) return;
          if (attempts <= 3) {
            const delay = Math.pow(2, attempts - 1) * 100;
            retryTimer = setTimeout(tryCharge, delay);
          } else {
            settled = true;
            reject(error);
          }
        },
      );
    };
    tryCharge();
  });

  return {
    promise,
    cancel() {
      if (stopped || settled) return;

      stopped = true;
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      controller?.abort();
      rejectOuter(new Error('Canceled by client'));
    },
  };
}
