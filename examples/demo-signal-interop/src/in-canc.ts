/**
 * Scenario 1: signal → CancelablePromise
 * Canc: { signal } option + array first-wins + pre-aborted → born-canceled
 */

import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { isAbortError } from '@cancjs/toolbox';
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

export async function signalToPromiseCanc() {
  // Demonstrates AbortSignal interop: feeding external signal into CancelablePromise.
  // We use new AbortController here to simulate an external signal source.
  const controller = new AbortController();
  const signal = controller.signal;

  // Signal fed as { signal } option: cancellation flows down
  const promise = new CancelablePromise(
    (resolve, reject) => {
      mockFetch('https://api.example.com/data', signal).then(resolve, reject);
    },
    { signal },
  );

  try {
    await setTimeout(50);
    controller.abort();
    // Rejection propagates; nothing below runs
    const result = await promise;
    console.log('[canc] result:', result);
  } catch (err: unknown) {
    if (isAbortError(err) || (isCancelError(err) && err.aborted)) {
      console.log('[canc] aborted');
    } else {
      throw err;
    }
  }
}

export async function signalArrayCanc() {
  // Demonstrates AbortSignal interop: composing multiple signals as an array (first-wins).
  // We use new AbortController here to demonstrate signal array composition.
  const controller1 = new AbortController();
  const controller2 = new AbortController();
  const signals = [controller1.signal, controller2.signal];

  // Array is first-wins, cleaner than manual race
  const promise = new CancelablePromise(
    (resolve, reject) => {
      mockFetch('https://api.example.com/data').then(resolve, reject);
    },
    { signal: signals },
  );

  try {
    await setTimeout(50);
    controller1.abort(); // First to abort wins
    const result = await promise;
    console.log('[canc] result:', result);
  } catch (err: unknown) {
    if (isAbortError(err) || (isCancelError(err) && err.aborted)) {
      console.log('[canc] array signal aborted');
    } else {
      throw err;
    }
  }
}

export async function preAbortedSignalCanc() {
  // Demonstrates AbortSignal interop: pre-aborted signal making the promise born-canceled.
  // We use new AbortController here to simulate a pre-aborted signal source.
  const controller = new AbortController();
  controller.abort(); // Pre-abort

  // Born-canceled: rejects immediately on construction
  try {
    const promise = new CancelablePromise(
      (resolve, reject) => {
        mockFetch('https://api.example.com/data').then(resolve, reject);
      },
      { signal: controller.signal },
    );

    const result = await promise;
    console.log('[canc] result:', result);
  } catch (err: unknown) {
    if (isAbortError(err) || (isCancelError(err) && err.aborted)) {
      console.log('[canc] pre-aborted signal born-canceled');
    } else {
      throw err;
    }
  }
}
