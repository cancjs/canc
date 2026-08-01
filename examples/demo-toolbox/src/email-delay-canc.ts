import type CancelablePromise from '@cancjs/promise';
import { delay } from '@cancjs/toolbox';
import type { MockApiBundle } from '@shared/mock-api';

type MailApi = MockApiBundle['mail'];

/**
 * Sends an email after a 1000ms delay using the toolbox delay utility, which is
 * bound to CancelablePromise. cancel() clears the timer immediately and prevents
 * the email send. jest.getTimerCount drops to 0 on cancel (see spec).
 */
export function sendEmailWithDelay(mailApi: MailApi, email: string): CancelablePromise<void> {
  return delay(1000).then(() => {
    mailApi.send(email);
  });
}
