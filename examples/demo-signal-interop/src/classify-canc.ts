/**
 * Scenario 4: Classification — error handling
 * Canc: CancelError inspection + suppress/suppressAbort helpers
 */

import {
 CancelablePromise,
 CancelError,
 isAbortError,
} from '@cancjs/promise';
import { suppressAbort, suppress } from '@cancjs/toolbox';
import { setTimeout } from 'timers/promises';

async function mayFailTask(): Promise<string> {
 await setTimeout(50);
 throw new DOMException('AbortError', 'AbortError');
}

export async function classifyAbortErrorCanc() {
 try {
 const promise = new CancelablePromise<string>((resolve, reject) => {
 mayFailTask().then(resolve, reject);
 }, { signal: AbortSignal.timeout(30) });

 const result = await promise;
 console.log('[canc] result:', result);
 } catch (err: unknown) {
 // Inspect CancelError: .aborted + .cause
 if (err instanceof CancelError) {
 if (err.aborted) {
 console.log('[canc] aborted — cause:', err.cause?.name);
 } else {
 console.log('[canc] canceled');
 }
 } else if (err instanceof Error) {
 console.log('[canc] other error:', err.message);
 }
 }
}

export async function suppressAbortCanc() {
 const promise = new CancelablePromise<string>((resolve, reject) => {
 mayFailTask().then(resolve, reject);
 }, { signal: AbortSignal.timeout(30) });

 // suppressAbort: takes promise, returns promise with abort swallowed
 const result = await suppressAbort(promise);
 if (result === undefined) {
 // Abort suppressed
 console.log('[canc] abort suppressed');
 } else {
 console.log('[canc] result:', result);
 }
}

export async function suppressMultipleErrorsCanc() {
 const promise = new CancelablePromise<string>((resolve, reject) => {
 mayFailTask().then(resolve, reject);
 }, { signal: AbortSignal.timeout(30) });

 // suppress(['abort', 'cancel']): returns promise that swallows matching errors
 const result = await suppress(['abort', 'cancel'], promise);
 if (result === undefined) {
 console.log('[canc] abort/cancel suppressed');
 } else {
 console.log('[canc] result:', result);
 }
}

export async function isAbortErrorCheckCanc() {
 try {
 const promise = new CancelablePromise<string>((resolve, reject) => {
 mayFailTask().then(resolve, reject);
 }, { signal: AbortSignal.timeout(30) });

 const result = await promise;
 console.log('[canc] result:', result);
 } catch (err: unknown) {
 // isAbortError: helper for quick classification
 if (isAbortError(err)) {
 console.log('[canc] abort error — cause:', (err as CancelError).cause?.name);
 } else if (err instanceof Error) {
 console.log('[canc] other error:', err.message);
 }
 }
}
