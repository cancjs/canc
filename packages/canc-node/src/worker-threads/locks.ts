import * as workerThreads from 'node:worker_threads';

import { CancelablePromise, CancelError } from '@cancjs/promise';

import { isCancelable } from '../../../_util';
import { features } from '../features';
import { gated } from '../gate';

export type TLockMode = 'exclusive' | 'shared';

export interface ILock {
  readonly name: string;
  readonly mode: TLockMode;
}

export interface ILockOptions {
  /** `exclusive` by default, `shared` for a reader that tolerates other readers. */
  mode?: TLockMode;
  /** Do not queue: the body runs immediately with `null` when the lock is already held. */
  ifAvailable?: boolean;
  /** Take the lock from its current holder, whose own request rejects with `CancelError`. */
  steal?: boolean;
  /** The caller's own signal, aborting the wait for the lock. */
  signal?: AbortSignal;
}

/**
 * Body run while the lock is held. The signal aborts when the request is canceled or the lock is
 * stolen; the lock stays held until the returned value settles either way.
 */
export type TLockBody<T> = (lock: ILock | null, signal: AbortSignal) => T | PromiseLike<T>;

export interface IRequestLockFn {
  <T>(name: string, fn: TLockBody<T>): CancelablePromise<T>;
  <T>(name: string, options: ILockOptions, fn: TLockBody<T>): CancelablePromise<T>;
}

interface INodeLockManager {
  request(name: string, options: object, callback: (lock: ILock | null) => unknown): Promise<unknown>;
}

// the Web Locks API landed in node 24 and is not in the typings this package builds against, so the
// manager is read structurally at the mirroring boundary
const nodeLocks = (workerThreads as { locks?: INodeLockManager }).locks;

function requestLockImpl<T>(
  name: string,
  optionsOrFn: ILockOptions | TLockBody<T>,
  maybeFn?: TLockBody<T>,
): CancelablePromise<T> {
  const fn = typeof optionsOrFn === 'function' ? optionsOrFn : maybeFn!;
  const options: ILockOptions = typeof optionsOrFn === 'function' ? {} : optionsOrFn;
  const { signal: callerSignal, ...requestOptions } = options;

  return new CancelablePromise<T>(
    (resolve, reject, { getSignal, handleCancel }) => {
      const bodyController = new AbortController();
      let canceled = false;
      let granted = false;
      let result: T | PromiseLike<T> | undefined;

      // only tells the body to stop: the lock is released by the body settling, never by this
      const stopBody = (reason: unknown): void => {
        bodyController.abort(reason);
        if (isCancelable(result)) {
          result.cancel(reason);
        }
      };

      handleCancel((reason) => {
        canceled = true;
        if (granted) {
          stopBody(reason);
        }
      });

      // ifAvailable and steal never queue, and the platform rejects a signal alongside either
      const waits = !requestOptions.ifAvailable && !requestOptions.steal;
      const nodeOptions = waits ? { ...requestOptions, signal: getSignal() } : requestOptions;

      const request = nodeLocks!.request(name, nodeOptions, (lock) => {
        // a grant that cannot be refused, after the caller already gave up
        if (canceled) {
          return undefined;
        }

        granted = true;
        const settled = new Promise<T>((settle) => {
          result = fn(lock, bodyController.signal);
          settle(result);
        });

        settled.then(resolve, reject);

        // node holds the lock until this settles, so it follows the body and nothing else
        return settled.then(
          () => undefined,
          () => undefined,
        );
      });

      request.catch((err: unknown) => {
        if (!granted) {
          // an aborted wait lands here too, after canc already rejected with CancelError
          reject(err);
          return;
        }

        // node rejects a granted request only when another request steals the lock
        const stolen = new CancelError(undefined, { cause: err });
        reject(stolen);
        stopBody(stolen);
      });
    },
    { signal: callerSignal },
  );
}

/**
 * Runs a function while holding a named lock, and resolves what the function returns.
 *
 * The lock is process-wide, shared with every other thread, and not a file lock: nothing outside
 * this process is serialized by it. Canceling while the lock is still being waited for aborts the
 * acquisition. Canceling while it is held rejects at once with `CancelError` and aborts the signal
 * handed to the body, but the lock stays held until the body's own result settles, so a body that
 * ignores the signal still never overlaps the next holder. A holder whose lock is stolen rejects
 * with `CancelError`, its cause being node's `AbortError`, and its signal aborts the same way.
 *
 * With `ifAvailable`, a lock that is already held hands the body `null` instead of queueing.
 *
 * @param name Any string, scoping the lock within the process.
 * @param options Node's own request options, plus the caller's signal.
 * @param fn Body holding the lock until the value it returns settles, given the lock and a signal.
 */
export const requestLock: IRequestLockFn = gated(
  features.hasWorkerLocks,
  'requestLock',
  '24',
  () => requestLockImpl as IRequestLockFn,
  'promise',
);
