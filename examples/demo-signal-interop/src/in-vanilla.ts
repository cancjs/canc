/**
 * Scenario 1: signal → CancelablePromise
 * Vanilla: AbortController with explicit listener + cleanup
 */

import { setTimeout } from 'timers/promises';

function mockFetch(url: string, signal?: AbortSignal): Promise<string> {
 return (async () => {
 // Simulates network latency
 await setTimeout(100);
 if (signal?.aborted) {
 throw new DOMException('AbortError', 'AbortError');
 }
 return `fetched: ${url}`;
 })();
}

export async function signalToPromiseVanilla() {
 const controller = new AbortController();
 const signal = controller.signal;

 const promise = mockFetch('https://api.example.com/data', signal);

 // Signal consumed but promise keeps running (controller never called)
 // Result is discarded but request completed anyway
 try {
 await setTimeout(50);
 controller.abort();
 const result = await promise;
 // keeps running after abort — wasted work
 console.log('[vanilla] result:', result);
 } catch (err: unknown) {
 if (err instanceof DOMException && err.name === 'AbortError') {
 console.log('[vanilla] aborted');
 } else {
 throw err;
 }
 }
}

export async function signalArrayVanilla() {
 const controller1 = new AbortController();
 const controller2 = new AbortController();
 const signals = [controller1.signal, controller2.signal];

 // Vanilla: no built-in "first-abort-wins"; need manual any()
 const promise = (async () => {
 const anyAborted = await Promise.race(
 signals.map(
 (sig) =>
 new Promise<void>((_, rej) =>
 sig.addEventListener('abort', () =>
 rej(new DOMException('AbortError', 'AbortError')),
 ),
 ),
 ),
 ).then(
 () => mockFetch('https://api.example.com/data'),
 (err) => Promise.reject(err),
 );
 return anyAborted;
 })();

 try {
 await setTimeout(50);
 controller1.abort(); // First to abort wins
 const result = await promise;
 console.log('[vanilla] result:', result);
 } catch (err: unknown) {
 if (err instanceof DOMException && err.name === 'AbortError') {
 console.log('[vanilla] array signal aborted');
 } else {
 throw err;
 }
 }
}

export async function preAbortedSignalVanilla() {
 const controller = new AbortController();
 controller.abort(); // Pre-abort

 // Promise rejected immediately
 try {
 const result = await mockFetch('https://api.example.com/data', controller.signal);
 console.log('[vanilla] result:', result);
 } catch (err: unknown) {
 if (err instanceof DOMException && err.name === 'AbortError') {
 console.log('[vanilla] pre-aborted signal rejected immediately');
 } else {
 throw err;
 }
 }
}
