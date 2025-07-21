// placeholder, see example task
import CancelablePromise, { isCancelError } from '@cancjs/promise';
import { loadProfile } from './profile';

async function main(): Promise<void> {
 const pending = new CancelablePromise<{ id: string; name: string }>((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 loadProfile('u1', 50, controller.signal).then(resolve, reject);
 });

 // The caller loses interest. One cancel() call, and the rejection is an ordinary CancelError
 // that flows through the same try/catch as any other failure.
 pending.cancel();

 try {
 await pending;
 console.log('canc: profile loaded');
 } catch (error) {
 if (isCancelError(error)) {
 console.log('canc: canceled');
 } else {
 throw error;
 }
 }
}

main();
