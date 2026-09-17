import { ChildProcess } from 'node:child_process';

import { CancelablePromise } from '@cancjs/promise';

// upper bound on how long a canceled call waits for the child, so cancel can never hang
const EXIT_WAIT_MS = 5000;

/**
 * Sends the termination signal node would send on abort and waits for the child to exit.
 *
 * @param child The child process to terminate.
 * @param killSignal The signal to send, defaulting to `SIGTERM`.
 * @returns A promise settling once the child has exited, or once the wait times out.
 */
export function killAndWaitForExit(child: ChildProcess, killSignal?: NodeJS.Signals | number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  // nothing here is cancelable, so a vanilla promise is the right primitive
  return new Promise<void>((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolve();
    }, EXIT_WAIT_MS);

    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    child.once('exit', onExit);

    try {
      child.kill(killSignal ?? 'SIGTERM');
    } catch {
      // a child that is already gone is in the state the caller asked for
      child.removeListener('exit', onExit);
      clearTimeout(timer);
      resolve();
    }
  });
}

export interface ISettlementSink<T> {
  settle(value: T): void;
  subscribe(listener: (value: T) => void): void;
}

/**
 * Records a value the first time it settles and replays it to a single subscriber.
 *
 * Node's own terminal events (a callback, `close`, `error`) fire once, whether or not anything is
 * listening yet. The sink is what lets a `promise` accessed after the fact still have an answer,
 * instead of attaching a listener to an event that already happened.
 */
export function createSink<T>(): ISettlementSink<T> {
  let settled: T | undefined;
  let hasSettled = false;
  // single subscriber contract holds because accessor is memoized per child
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
 * Adds a lazy, memoized `promise` accessor to a child process.
 *
 * The promise is built on first access. Building it eagerly would leave a rejected promise with no
 * handler attached for callers who never wanted one, which is an unhandled rejection where node
 * only emits an event.
 *
 * @param child The child process node returned.
 * @param create Factory building the promise on first access.
 */
export function defineProcessPromise<T>(child: ChildProcess, create: () => CancelablePromise<T>): void {
  let memo: CancelablePromise<T> | undefined;

  Object.defineProperty(child, 'promise', {
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
