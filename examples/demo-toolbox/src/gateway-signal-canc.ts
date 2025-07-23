import CancelablePromise from '@cancjs/promise';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * CancelablePromise gateway: cancel() or external signal → both abort the call.
 * handleCancel() wires the signal down to the mock API. No manual error-name checks.
 * Cancellation is just a rejection—no special case handling needed.
 */
export function callGatewayWithSignal(
 mockApi: MockApiBundle,
 signal: AbortSignal
): CancelablePromise<{ transactionId: string }> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 const controller = new AbortController();

 const onAbort = () => controller.abort();
 signal.addEventListener('abort', onAbort);
 handleCancel(() => {
 signal.removeEventListener('abort', onAbort);
 controller.abort();
 });

 mockApi.gateway.call({ method: 'pay', amount: 100 }, controller.signal).then(
 resolve,
 reject
 );
 });
}
