/**
 * Scenario 5: withSignal wrapper — p-signal style
 * Canc: { signal } option makes it trivial
 */

import { CancelablePromise } from '@cancjs/promise';
import { setTimeout } from 'timers/promises';

// Canc wrapper: just { signal } option
export function withSignalCanc<T>(
 signal: AbortSignal,
 work: () => Promise<T>,
): CancelablePromise<T> {
 return new CancelablePromise((resolve, reject) => {
 work().then(resolve, reject);
 }, { signal });
}

export async function withSignalWrapperCanc() {
 const controller = new AbortController();

 try {
 const result = await withSignalCanc(controller.signal, async () => {
 await setTimeout(100);
 return 'work completed';
 });
 console.log('[canc] result:', result);
 } catch (err: unknown) {
 if (err instanceof DOMException && err.name === 'AbortError') {
 // Canceled here — nothing below runs
 console.log('[canc] work aborted');
 } else {
 throw err;
 }
 }

 // Abort after work starts
 await setTimeout(50);
 controller.abort();
}
