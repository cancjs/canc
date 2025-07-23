/**
 * Scenario 2: CancelablePromise → signal
 * Vanilla: manual abort controller + listener
 */

import { setTimeout } from 'timers/promises';

type MockSDKCall = {
 start: (signal?: AbortSignal) => Promise<string>;
};

// Mock SDK that accepts AbortSignal
const mockSDK: MockSDKCall = {
 start: async (signal?: AbortSignal) => {
 try {
 await setTimeout(100);
 if (signal?.aborted) {
 throw new DOMException('AbortError', 'AbortError');
 }
 return 'SDK call completed';
 } catch (err) {
 if (err instanceof DOMException && err.name === 'AbortError') {
 throw err;
 }
 throw err;
 }
 },
};

export async function promiseToSignalVanilla() {
 const controller = new AbortController();
 let completed = false;

 // Manual listener to convert promise to signal
 const promise = (async () => {
 try {
 const result = await mockSDK.start(controller.signal);
 completed = true;
 return result;
 } catch (err) {
 if (err instanceof DOMException && err.name === 'AbortError') {
 // SDK aborted — listener never fires
 throw err;
 }
 throw err;
 }
 })();

 // Simulate cancellation
 try {
 await setTimeout(50);
 controller.abort();
 const result = await promise;
 console.log('[vanilla] SDK result:', result);
 } catch (err: unknown) {
 if (err instanceof DOMException && err.name === 'AbortError') {
 console.log('[vanilla] SDK call aborted, completed flag:', completed);
 } else {
 throw err;
 }
 }
}

export async function signalFeedingMultipleAPIsVanilla() {
 const controller = new AbortController();
 const signal = controller.signal;

 // Multiple API calls fed same signal
 const calls = Promise.all([
 mockSDK.start(signal),
 mockSDK.start(signal),
 mockSDK.start(signal),
 ]).catch((err) => {
 if (err instanceof DOMException && err.name === 'AbortError') {
 console.log('[vanilla] all SDK calls aborted');
 }
 throw err;
 });

 try {
 await setTimeout(50);
 controller.abort(); // All APIs abort together
 const result = await calls;
 console.log('[vanilla] all results:', result);
 } catch (err) {
 // caught above
 }
}
