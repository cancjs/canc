// placeholder, see example task
// Proves the shared mock-api resolves through the examples workspace and that a canceled
// CancelablePromise carries its cancellation into the fake network (aborted marker).
import CancelablePromise, { isCancelError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';

describe('demo-promise-basics + mock-api smoke', () => {
 it('cancel() aborts the in-flight mock request', async () => {
 const mock = createMockApi({ latency: 50, jitter: 0 });

 const pending = new CancelablePromise((resolve, reject, handleCancel) => {
 const controller = new AbortController();
 handleCancel(() => controller.abort());
 mock.products.list(controller.signal).then(resolve, reject);
 });

 pending.cancel();

 let caught: unknown;
 try {
 await pending;
 } catch (error) {
 caught = error;
 }

 expect(isCancelError(caught)).toBe(true);
 expect(mock.api.calls.some((c) => c.endpoint === 'products.list' && c.status === 'aborted')).toBe(true);
 });
});
