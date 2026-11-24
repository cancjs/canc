import * as workerThreads from 'node:worker_threads';

import { CANCEL_PROMISE_BRAND, CancelablePromise, CancelError, isAbortError } from '@cancjs/promise';

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
 * stolen; an ordinary lock stays held until the returned value and cancellation cleanup settle.
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

interface ICountedInterest {
  cancel(reason?: unknown): void | PromiseLike<unknown>;
  _subscribe(onFulfilled?: (value: unknown) => void, onRejected?: (reason: unknown) => void): void;
}

// Current promise copies share this internal consumer protocol, independent of their constructors.
interface ICurrentSource<T> {
  then(): ICountedInterest;
  _subscribe(onFulfilled: (value: T) => void, onRejected: (reason: unknown) => void): void;
  _retainRef(): unknown;
}

function isCurrentSource<T>(value: T | PromiseLike<T>): value is (T | PromiseLike<T>) & ICurrentSource<T> {
  const source = value as (Partial<ICurrentSource<T>> & { [CANCEL_PROMISE_BRAND]?: true }) | null | undefined;
  // A foreign object may reject even a brand lookup, but native assimilation does not need it
  try {
    if (source?.[CANCEL_PROMISE_BRAND] !== true) return false;
  } catch {
    return false;
  }
  return (
    typeof source._subscribe === 'function' &&
    typeof source._retainRef === 'function' &&
    typeof source.then === 'function'
  );
}

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
      let bodyReady = false;
      let stopRequested = false;
      let interestReleased = false;
      let stopReason: unknown;
      let countedInterest: ICountedInterest | undefined;
      let bodySettled: Promise<void>;
      let cleanupSettled: Promise<void> = Promise.resolve();

      const releaseInterest = (): void => {
        if (!granted || !bodyReady || !stopRequested || interestReleased || !countedInterest) return;
        interestReleased = true;
        cleanupSettled = Promise.resolve(countedInterest.cancel(stopReason)).then(
          () => undefined,
          () => undefined,
        );
      };

      // Cancellation may be reentrant while the body registers its result.
      const stopBody = (reason: unknown): void => {
        if (stopRequested) return;
        stopRequested = true;
        stopReason = reason;
        bodyController.abort(reason);
        releaseInterest();
      };

      handleCancel((reason) => {
        canceled = true;
        stopBody(reason);
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
        try {
          const result = fn(lock, bodyController.signal);
          if (isCurrentSource(result)) {
            const source = result;
            // only this child counts as the holder's interest
            countedInterest = source.then();
            countedInterest._subscribe(undefined, () => undefined);
            source._subscribe(resolve, reject);
            let finish!: () => void;
            bodySettled = new Promise<void>((settle) => {
              finish = settle;
            });
            source._subscribe(finish, finish);
          } else {
            const observed = Promise.resolve(result);
            observed.then(resolve, reject);
            bodySettled = observed.then(
              () => undefined,
              () => undefined,
            );
          }

          bodyReady = true;
          releaseInterest();
          // Ordinary holders must wait for both the original body and the released child's cleanup.
          return bodySettled.then(() => cleanupSettled);
        } catch (error) {
          // Protocol setup failures are body errors, not native steal notifications
          reject(error);
          return undefined;
        }
      });

      request.catch((err: unknown) => {
        if (!granted || !isAbortError(err)) {
          // an aborted wait lands here too, after canc already rejected with CancelError
          reject(err);
          return;
        }

        // a native AbortError after grant reports a stolen lock
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
 * handed to the body, releasing only the holder's interest in a returned CancelablePromise.
 * An ordinary lock stays held until the original body and triggered cancellation cleanup settle.
 * A holder whose lock is stolen rejects with `CancelError`, its cause being node's `AbortError`,
 * and its signal aborts the same way; a steal may overlap the old body's cleanup.
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
