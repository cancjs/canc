/**
 * Scenario 4: Classification — error handling
 * Canc: CancelError inspection + suppressCancel/suppressAbort helpers
 */

import { CancelablePromise, CancelError, isCancelError, suppressCancel } from '@cancjs/promise';
import { isAbortError, suppressAbort } from '@cancjs/toolbox';
import { setTimeout } from 'timers/promises';

async function mayFailTask(): Promise<string> {
  await setTimeout(50);
  throw new DOMException('AbortError', 'AbortError');
}

export async function classifyAbortErrorCanc() {
  try {
    const promise = new CancelablePromise<string>(
      (resolve, reject) => {
        mayFailTask().then(resolve, reject);
      },
      { signal: AbortSignal.timeout(30) },
    );

    const result = await promise;
    console.log('[canc] result:', result);
  } catch (err: unknown) {
    // Inspect CancelError: .aborted + .cause
    if (isCancelError(err)) {
      if ((err as CancelError).aborted) {
        console.log('[canc] aborted — cause:', (err as CancelError).cause?.name);
      } else {
        console.log('[canc] canceled');
      }
    } else if (err instanceof Error) {
      console.log('[canc] other error:', err.message);
    }
  }
}

export async function suppressAbortCanc() {
  const promise = new CancelablePromise<string>(
    (resolve, reject) => {
      mayFailTask().then(resolve, reject);
    },
    { signal: AbortSignal.timeout(30) },
  );

  // suppressAbort: takes promise, returns promise with abort swallowed
  const result = await suppressAbort(promise);
  if (result === undefined) {
    // Abort suppressed
    console.log('[canc] abort suppressed');
  } else {
    console.log('[canc] result:', result);
  }

  // Ordinary CancelError is rethrown (not swallowed by suppressAbort)
  const canceledPromise = new CancelablePromise<string>(() => {});
  canceledPromise.cancel('user cancel');
  try {
    await suppressAbort(canceledPromise);
  } catch (err: unknown) {
    if (isCancelError(err)) {
      console.log('[canc] ordinary CancelError rethrown by suppressAbort');
    }
  }
}

export async function suppressMultipleErrorsCanc() {
  const promise = new CancelablePromise<string>(
    (resolve, reject) => {
      mayFailTask().then(resolve, reject);
    },
    { signal: AbortSignal.timeout(30) },
  );

  // suppressCancel with { abort: true }: swallows both CancelError and AbortError
  const result = await suppressCancel(promise, { abort: true });
  if (result === undefined) {
    console.log('[canc] abort/cancel suppressed');
  } else {
    console.log('[canc] result:', result);
  }
}

export async function isAbortErrorCheckCanc() {
  try {
    const promise = new CancelablePromise<string>(
      (resolve, reject) => {
        mayFailTask().then(resolve, reject);
      },
      { signal: AbortSignal.timeout(30) },
    );

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
