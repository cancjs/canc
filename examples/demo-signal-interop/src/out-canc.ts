/**
 * Scenario 2: CancelablePromise → signal
 * Canc: toAbortSignal(p) feeds signal-taking APIs
 */

import { CancelablePromise } from '@cancjs/promise';
import { toAbortSignal } from '@cancjs/toolbox';
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

export async function promiseToSignalCanc() {
 const promise = new CancelablePromise<string>((resolve, reject) => {
 mockSDK.start(toAbortSignal(promise)).then(resolve, reject);
 });

 // Canceled here — nothing below runs
 try {
 await setTimeout(50);
 promise.cancel();
 const result = await promise;
 console.log('[canc] SDK result:', result);
 } catch (err: unknown) {
 if (err instanceof DOMException && err.name === 'AbortError') {
 console.log('[canc] SDK call aborted');
 } else {
 throw err;
 }
 }
}

export async function signalFeedingMultipleAPIsCanc() {
 const promise = new CancelablePromise<string[]>((resolve, reject) => {
 const signal = toAbortSignal(promise);
 // All APIs abort together when promise is canceled
 Promise.all([
 mockSDK.start(signal),
 mockSDK.start(signal),
 mockSDK.start(signal),
 ]).then(resolve, reject);
 });

 try {
 await setTimeout(50);
 promise.cancel();
 const result = await promise;
 console.log('[canc] all results:', result);
 } catch (err: unknown) {
 if (err instanceof DOMException && err.name === 'AbortError') {
 console.log('[canc] all SDK calls aborted');
 } else {
 throw err;
 }
 }
}
