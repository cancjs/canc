/**
 * Scenario 3: Composition — AbortSignal.timeout + user signal + canc
 * Canc: { signal: [timeout, userSignal] } → first-wins, auto cleanup
 */

import { CancelablePromise } from '@cancjs/promise';
import { setTimeout } from 'timers/promises';

async function slowerFetch(): Promise<string> {
 await setTimeout(500);
 return 'fetched data';
}

export async function composeTimeoutAndSignalCanc() {
 const userController = new AbortController();
 const userSignal = userController.signal;

 // Composition as array: first-wins, auto cleanup
 const timeoutSignal = AbortSignal.timeout(200);

 const promise = new CancelablePromise<string>((resolve, reject) => {
 slowerFetch().then(resolve, reject);
 }, { signal: [timeoutSignal, userSignal] });

 try {
 // Timeout fires first — promise rejects
 const result = await promise;
 console.log('[canc] result:', result);
 } catch (err: unknown) {
 if (err instanceof DOMException && err.name === 'AbortError') {
 // Canceled here — nothing below runs
 console.log('[canc] timeout or user abort');
 } else {
 throw err;
 }
 }
}

export async function composeMultipleSignalsCanc() {
 const userController = new AbortController();
 const timeoutController = new AbortController();

 const signals = [userController.signal, timeoutController.signal];

 const promise = new CancelablePromise<string>((resolve, reject) => {
 slowerFetch().then(resolve, reject);
 }, { signal: signals });

 try {
 // First signal to abort wins (or timeout)
 await setTimeout(300); // Trigger timeout
 const result = await promise;
 console.log('[canc] result:', result);
 } catch (err: unknown) {
 if (err instanceof DOMException && err.name === 'AbortError') {
 // Canceled here — nothing below runs
 console.log('[canc] one of the signals aborted');
 } else {
 throw err;
 }
 }
}
