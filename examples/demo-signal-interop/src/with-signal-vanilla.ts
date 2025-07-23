/**
 * Scenario 5: withSignal wrapper — p-signal style
 * Vanilla: manual wrapper with listener cleanup
 */

import { setTimeout } from 'timers/promises';

// Vanilla wrapper: AbortController + listener
export function withSignalVanilla<T>(
 signal: AbortSignal,
 work: () => Promise<T>,
): Promise<T> {
 let listener: EventListener | null = null;
 let abortPromise: Promise<never> | null = null;

 const abortPromise_ = new Promise<never>((_, reject) => {
 listener = () => reject(new DOMException('AbortError', 'AbortError'));
 signal.addEventListener('abort', listener);
 });
 abortPromise = abortPromise_;

 return Promise.race([work(), abortPromise]).finally(() => {
 // Cleanup listener
 if (listener) signal.removeEventListener('abort', listener);
 });
}

export async function withSignalWrapperVanilla() {
 const controller = new AbortController();

 try {
 const result = await withSignalVanilla(controller.signal, async () => {
 await setTimeout(100);
 return 'work completed';
 });
 console.log('[vanilla] result:', result);
 } catch (err: unknown) {
 if (err instanceof DOMException && err.name === 'AbortError') {
 console.log('[vanilla] work aborted');
 // keeps running after abort
 } else {
 throw err;
 }
 }

 // Abort after work starts
 await setTimeout(50);
 controller.abort();
}
