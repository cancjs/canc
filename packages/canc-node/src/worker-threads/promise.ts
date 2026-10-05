import { Worker as NodeWorker } from 'node:worker_threads';

import { CancelablePromise } from '@cancjs/promise';

export interface ISettlementSink<T> {
  settle(value: T): void;
  subscribe(listener: (value: T) => void): void;
}

/**
 * Records a value the first time it settles and replays it to any later subscriber.
 *
 * A worker's `exit` fires once, whether or not anything is listening yet, and node keeps no record
 * of it afterwards. The sink is what lets a `promise` read after the fact still have an answer,
 * instead of attaching a listener to an event that already happened.
 */
export function createSink<T>(): ISettlementSink<T> {
  let settled: T | undefined;
  let hasSettled = false;
  let listener: ((value: T) => void) | undefined;

  return {
    settle(value: T): void {
      if (hasSettled) {
        return;
      }
      hasSettled = true;
      settled = value;
      if (listener) {
        listener(value);
      }
    },
    subscribe(fn: (value: T) => void): void {
      if (hasSettled) {
        fn(settled as T);
      } else {
        listener = fn;
      }
    },
  };
}

/**
 * Adds a lazy, memoized `promise` accessor to a worker.
 *
 * The promise is built on first access. Building it eagerly would leave a rejected promise with no
 * handler attached for callers who never wanted one, which is an unhandled rejection where node
 * only emits an event.
 *
 * @param worker The worker node returned.
 * @param create Factory building the promise on first access.
 */
export function defineWorkerPromise<T>(worker: NodeWorker, create: () => CancelablePromise<T>): void {
  let memo: CancelablePromise<T> | undefined;

  Object.defineProperty(worker, 'promise', {
    configurable: true,
    enumerable: false,
    get(): CancelablePromise<T> {
      if (!memo) {
        memo = create();
      }
      return memo;
    },
  });
}

/**
 * Stops a thread and waits for it to be gone.
 *
 * @param worker The worker to terminate.
 * @returns A promise settling once the thread has stopped.
 */
export function terminateAndWaitForExit(worker: NodeWorker): Promise<void> {
  // terminate resolves once the thread has stopped, and a thread cannot refuse it the way a process
  // can refuse a signal, so no timeout guards this
  return Promise.resolve(worker.terminate()).then(
    () => undefined,
    () => undefined,
  );
}
