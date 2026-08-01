import { construct, TExecutorCtx } from './construct';
import { IToolboxDeps } from './deps';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';
import { startTimer, stopTimer } from './timers';

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/** A thenable exposing a `cancel` method, the minimal shape needed to stop it on timeout. */
interface ICancelableLike {
  then: PromiseLike<any>['then'];
  cancel: (reason?: any) => void;
}

/**
 * Rejection reason produced when a timeout elapses before the wrapped promise settles.
 */
export class TimeoutError extends Error {
  name: string;

  constructor(message?: string) {
    super(message);

    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'TimeoutError';
  }
}

if (typeof Symbol !== 'undefined' && Symbol?.toStringTag) {
  (TimeoutError.prototype as unknown as Record<PropertyKey, unknown>)[Symbol.toStringTag] = 'TimeoutError';
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  const candidate = error as TimeoutError | null | undefined;

  return isObject(candidate) && typeof candidate.message === 'string' && candidate.name === 'TimeoutError';
}

function isCancelable(value: unknown): value is ICancelableLike {
  const candidate = value as ICancelableLike | null | undefined;

  return isObject(candidate) && typeof candidate?.cancel === 'function';
}

/** Bind `timeout` to one promise implementation and set of timers. */
export function timeoutFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  /**
   * Reject with a TimeoutError if `promise` has not settled within `ms` milliseconds. When the
   * timeout wins the race, the underlying promise is canceled (if it exposes a `cancel` method) so
   * it stops its own work instead of running detached. The timer is always cleared once the race
   * settles.
   */
  return function timeout<T>(promise: T | PromiseLike<T>, ms = Infinity, options?: K['options']): TPromiseOf<K, T> {
    // The returned promise owns the timer so that canceling it (cancelable flavor) clears the
    // pending timeout and stops the underlying operation, leaving no leaked work. Under a plain
    // native Promise the context is undefined and the timer simply runs to completion.
    return construct<T, K>(
      deps.Impl,
      (resolve, reject, ctx?: TExecutorCtx) => {
        let settled = false;
        const id = startTimer(
          () => {
            if (settled) return;
            settled = true;
            // Timeout won: stop the underlying operation so it does not run detached.
            if (isCancelable(promise)) {
              promise.cancel(new TimeoutError());
            }
            reject(new TimeoutError());
          },
          ms,
          deps,
        );

        deps.Impl.resolve(promise).then(
          (value: T) => {
            if (settled) return;
            settled = true;
            stopTimer(id, deps);
            resolve(value);
          },
          (reason: any) => {
            if (settled) return;
            settled = true;
            stopTimer(id, deps);
            reject(reason);
          },
        );

        if (ctx) {
          ctx.handleCancel(() => {
            settled = true;
            stopTimer(id, deps);
            if (isCancelable(promise)) {
              promise.cancel();
            }
          });
        }
      },
      options,
    );
  };
}
