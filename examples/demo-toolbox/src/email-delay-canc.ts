import CancelablePromise from '@cancjs/promise';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * CancelablePromise delay: cancel() clears the timer immediately. handleCancel cleans up
 * the timeout. jest.getTimerCount drops to 0 on cancel (see spec).
 */
export function sendEmailWithDelay(
 mockApi: MockApiBundle,
 email: string
): CancelablePromise<void> {
 return new CancelablePromise((resolve, reject, handleCancel) => {
 let timeoutId: NodeJS.Timeout | null = null;

 const cleanup = () => {
 if (timeoutId !== null) {
 clearTimeout(timeoutId);
 timeoutId = null;
 }
 };
 handleCancel(cleanup);

 timeoutId = setTimeout(() => {
 mockApi.mail.send(email);
 resolve();
 }, 1000);
 });
}
