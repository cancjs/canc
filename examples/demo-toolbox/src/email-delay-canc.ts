import CancelablePromise from '@cancjs/promise';
import { delay } from '@cancjs/toolbox';
import type { MockApiBundle } from '@shared/mock-api';

/**
 * Sends an email after a 1000ms delay using the toolbox delay utility bound to
 * CancelablePromise. cancel() clears the timer immediately and prevents the email send.
 * jest.getTimerCount drops to 0 on cancel (see spec).
 */
export function sendEmailWithDelay(
 mockApi: MockApiBundle,
 email: string
): Promise<void> {
 return delay(1000, undefined, { impl: CancelablePromise as any }).then(() => {
 mockApi.mail.send(email);
 });
}
