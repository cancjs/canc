import { isCancelError } from '@cancjs/promise';
import { createMockApi } from '@shared/mock-api';
import { loadProfile } from './profile-service-canc';

async function main(): Promise<void> {
 const mockApi = createMockApi({ latency: 100, jitter: 0, trace: console.log });

 console.log('canc: start load');
 const pending = loadProfile(mockApi, 'p1');

 // The caller loses interest after a short delay. cancel() stops the underlying fetch.
 setTimeout(() => {
 pending.cancel();
 console.log('canc: cancel() called');
 }, 30);

 try {
 await pending;
 console.log('canc: profile loaded');
 } catch (error) {
 if (isCancelError(error)) {
 // cancellation is just a rejection — regular catch works.
 console.log('canc: caught CancelError — one cancel() call, no threading, built-in state');
 } else {
 throw error;
 }
 }

 // Awaiting cancel() waits for all handlers to settle, proving cancellation is synchronous
 // under the hood but its effects (cleanup) are observable.
 console.log('canc: await cancel() ordering');
 const p = loadProfile(mockApi, 'p2');
 p.cancel();
 await p.cancel(); // Already canceled, but await proves handlers ran.
 console.log('canc: done');
}

main();



