import CancelablePromise from '@cancjs/promise';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * CancelablePromise with timeout: when the timeout fires, it cancels the underlying inventory
 * call immediately. handleCancel() propagates the cancel signal down via AbortController.
 * The mock API logs 'aborted' (see spec) — compare vanilla 'completed'.
 */
export function fetchInventoryWithTimeout(
 mockApi: MockApiBundle,
 productId: string
): CancelablePromise<Record<string, number>> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());

 let timeoutId: NodeJS.Timeout | null = null;

 const cleanup = () => {
 if (timeoutId !== null) {
 clearTimeout(timeoutId);
 timeoutId = null;
 }
 };
 handleCancel(cleanup);

 timeoutId = setTimeout(() => {
 controller.abort();
 }, 500);

 mockApi.inventory.get(productId, controller.signal).then(
 (result) => {
 cleanup();
 resolve(result);
 },
 (err) => {
 cleanup();
 reject(err);
 }
 );
 });
}
