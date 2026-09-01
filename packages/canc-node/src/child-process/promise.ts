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
