import * as workerThreads from 'node:worker_threads';

import { CancelablePromise } from '@cancjs/promise';

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
  /** Take the lock from its current holder, whose own request rejects. */
  steal?: boolean;
  /** The caller's own signal, aborting the wait for the lock. */
  signal?: AbortSignal;
}

export type TLockBody<T> = (lock: ILock | null) => T | PromiseLike<T>;

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
      let body: CancelablePromise<T> | undefined;

      // registered before the request, so a cancel arriving while the body holds the lock has a
      // handler to reach; while still waiting there is no body and node's signal does the work
      handleCancel(() => (body ? body.cancel() : undefined));

      // ifAvailable and steal never queue, and the platform rejects a signal alongside either
      const waits = !requestOptions.ifAvailable && !requestOptions.steal;
      const nodeOptions = waits ? { ...requestOptions, signal: getSignal() } : requestOptions;

      const request = nodeLocks!.request(name, nodeOptions, (lock) => {
        body = new CancelablePromise<T>((settle) => {
          settle(fn(lock));
        });
        resolve(body);

        // node holds the lock until this promise settles, so the release is shielded: the cancel
        // unwinding the body must not be able to interrupt it. Settling either way is not
        // swallowing anything, the body's own outcome reaches the caller through `resolve` above
        return new CancelablePromise<void>(
          (released) => {
            body!.then(
              () => released(),
              () => released(),
            );
          },
          { shield: true },
        );
      });

      // an aborted wait rejects here with node's AbortError, which no caller ever sees: canc has
      // already rejected with the CancelError this package promises
      request.catch(reject);
    },
    { signal: callerSignal },
  );
}

/**
 * Runs a function while holding a named lock, and resolves what the function returns.
 *
 * The lock is process-wide, shared with every other thread, and not a file lock: nothing outside
 * this process is serialized by it. Canceling while the lock is still being waited for aborts the
 * acquisition; canceling while it is held cancels the body and then releases the lock.
 *
 * With `ifAvailable`, a lock that is already held hands the body `null` instead of queueing.
 *
 * @param name Any string, scoping the lock within the process.
 * @param options Node's own request options, plus the caller's signal.
 * @param fn Body holding the lock until the value it returns settles.
 */
export const requestLock: IRequestLockFn = gated(
  features.hasWorkerLocks,
  'requestLock',
  '24',
  requestLockImpl as IRequestLockFn,
);
