import { createMockApi, isAbortError } from '@shared/mock-api';
import { loadProfile, loadProfileAbortable } from './profile-service-vanilla';

async function main(): Promise<void> {
 const mockApi = createMockApi({ latency: 100, jitter: 0, trace: console.log });

 // Uncancelable: load, cancel, but the fetch keeps running.
 {
 console.log('vanilla: start load (uncancelable)');
 const pending = loadProfile(mockApi, 'p1');
 // The caller loses interest immediately — but the network call continues.
 setTimeout(() => {
 console.log('vanilla: lost interest, but call keeps running');
 }, 10);

 try {
 await pending;
 console.log('vanilla: profile loaded (wasted work — we stopped caring)');
 } catch (error) {
 throw error;
 }
 }

 console.log('');

 // Abortable workaround: thread AbortSignal through, check error.name === 'AbortError'.
 {
 console.log('vanilla: start load (abortable)');
 const controller = new AbortController();
 const pending = loadProfileAbortable(mockApi, 'p1', controller.signal);
 // The caller loses interest after short delay.
 setTimeout(() => {
 controller.abort();
 console.log('vanilla: aborted');
 }, 30);

 try {
 await pending;
 console.log('vanilla: profile loaded');
 } catch (error) {
 if (isAbortError(error)) {
 console.log('vanilla: caught AbortError — had to thread signal through, check name');
 } else {
 throw error;
 }
 }
 }
}

main();




