import type { MockApiBundle } from '@shared/mock-api';

/**
 * Delays an email send by 1000ms (e.g. undo window). Plain promise: if canceled, the timer
 * still runs and the email sends anyway (unwanted side effect).
 */
export function sendEmailWithDelay(
 mockApi: MockApiBundle,
 email: string
): Promise<void> {
 return new Promise((resolve) => {
 setTimeout(() => {
 mockApi.mail.send(email);
 resolve();
 }, 1000);
 });
}
