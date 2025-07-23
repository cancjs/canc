import { isCancelError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';
import { loadProfile } from '../src/profile-service-canc';

describe('demo-promise-basics + mock-api integration', () => {
 it('cancel() aborts the in-flight mock request', async () => {
 const mock = createMockApi({ latency: 50, jitter: 0 });

 const pending = loadProfile(mock, 'p1');

 pending.cancel();

 let caught: unknown;
 try {
 await pending;
 } catch (error) {
 caught = error;
 }

 expect(isCancelError(caught)).toBe(true);
 expect(mock.api.calls.some((c) => c.endpoint === 'products.get' && c.status === 'aborted')).toBe(true);
 });
});
