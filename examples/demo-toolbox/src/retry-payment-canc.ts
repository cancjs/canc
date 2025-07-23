import CancelablePromise from '@cancjs/promise';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * CancelablePromise retry: cancel() stops backoff loops immediately. handleCancel clears the
 * backoff timer AND cancels any in-flight charge attempt. No state update on unmounted.
 */
export function chargeWithRetry(
 mockApi: MockApiBundle,
 paymentId: string
): CancelablePromise<string> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 let attempt = 0;
 let timeoutId: NodeJS.Timeout | null = null;
 let chargePromise: CancelablePromise<string> | null = null;

 const cleanup = () => {
 if (timeoutId !== null) {
 clearTimeout(timeoutId);
 timeoutId = null;
 }
 if (chargePromise && chargePromise.canceled !== true) {
 chargePromise.cancel();
 }
 };
 handleCancel(cleanup);

 const tryCharge = () => {
 attempt++;
 chargePromise = new CancelablePromise((res, rej) => {
 mockApi.payments.charge(paymentId).then(res, rej);
 });

 chargePromise.then(resolve, (err) => {
 if (attempt < 3) {
 const delay = Math.pow(2, attempt) * 100;
 timeoutId = setTimeout(tryCharge, delay);
 } else {
 reject(err);
 }
 });
 };
 tryCharge();
 });
}
