import { isCancelError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';
import { loadProfile } from '../src/profile-service-canc';

describe('demo-promise-basics smoke', () => {
 it('cancel() stops the underlying request and rejects with CancelError', async () => {
 const mockApi = createMockApi({ seedMode: true });

 // Create a cancelable profile load.
 const pending = loadProfile(mockApi, 'p1');

 // Cancel before the latency completes.
 pending.cancel();

 let caught: unknown;
 try {
 await pending;
 } catch (error) {
 caught = error;
 }

 // The rejection must be a CancelError, caught by ordinary try/catch.
 expect(isCancelError(caught)).toBe(true);
 expect(pending.isCanceled).toBe(true);

 // The mock API must have logged an abort (proving cancel reached the network call).
 const abortCall = mockApi.api.calls.find((call) => call.status === 'aborted');
 expect(abortCall).toBeDefined();
 });
});
