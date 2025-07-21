// placeholder, see example task
import CancelablePromise, { isCancelError } from '@cancjs/promise';

describe('demo-promise-basics smoke', () => {
 it('cancel() rejects with a CancelError caught by ordinary try/catch', async () => {
 let handlerRan = false;
 const p = new CancelablePromise<string>((resolve, _reject, handleCancel) => {
 handleCancel(() => {
 handlerRan = true;
 });
 setTimeout(() => resolve('done'), 50);
 });

 p.cancel();

 let caught: unknown;
 try {
 await p;
 } catch (error) {
 caught = error;
 }

 expect(handlerRan).toBe(true);
 expect(isCancelError(caught)).toBe(true);
 expect(p.isCanceled).toBe(true);
 });
});
