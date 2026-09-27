import { CancelablePromise, CancelError, isCancelError } from '@cancjs/promise';

import { ISchedulerDeps, resolveScheduler, resolveTimers } from './deps';
import { DEFAULT_PRIORITY } from './task-signal';
import { TTaskPriority } from './types';

/** Options for `postSchedulerTask`. */
export type IPostSchedulerTaskOptions = ISchedulerDeps & {
  /** Band the task starts in. Changeable afterwards through the returned promise. */
  priority?: TTaskPriority;
  /**
   * Milliseconds before the task is ENQUEUED, not before it runs, and not clamped the way
   * `setTimeout` clamps. Aborting during the wait means the task is never queued at all.
   */
  delay?: number;
  /** Extra lifetimes that abort the task. Their abort reason reaches the caller unchanged. */
  signal?: AbortSignal | AbortSignal[];
};

/** A posted task, cancelable, whose priority stays writable for as long as it is queued. */
export interface ISchedulerTaskPromise<T> extends CancelablePromise<T> {
  /**
   * The band the task is in. Assigning moves a task that has not started yet, which is the whole
   * reason this library posts every task under a controller of its own.
   */
  priority: TTaskPriority;
}

/**
 * Post `fn` to the platform scheduler and get back a cancelable promise for its result.
 *
 * Canceling aborts the task: queued, it is removed from the queue and never runs; already running,
 * it runs to completion, because a synchronous body cannot be interrupted by anything. The reason
 * travels unchanged. A cancel rejects with a `CancelError` and the abort reason of a caller's own
 * signal is handed back exactly as it was given, with no translation in either direction.
 *
 * Without a scheduler anywhere the task is scheduled through the resolved timers pair instead.
 * Cancellation keeps working; the priority becomes a no-op that still reports what was requested.
 */
export function postSchedulerTask<T>(
  fn: () => T | PromiseLike<T>,
  options?: IPostSchedulerTaskOptions,
): ISchedulerTaskPromise<T> {
  const requested = options?.priority ?? DEFAULT_PRIORITY;
  const pair = resolveScheduler(options);
  // A task always gets a controller of its own.
  // Caller signals are forwarded onto it.
  // This keeps `priority` writable and needs no signal composition.
  const controller = pair ? new pair.TaskController({ priority: requested }) : undefined;
  const port: AbortController = controller ?? new AbortController();
  let ownPriority = requested;

  const promise = new CancelablePromise<T>((resolve, reject, ctx) => {
    let detach = noop;
    const settle = (settlement: () => void): void => {
      detach();
      settlement();
    };

    // The handler receives the raw reason a caller passed to cancel().
    // It is normalized back into the error the promise itself rejects with.
    // What reaches the scheduler is a CancelError.
    ctx.handleCancel((reason) => port.abort(toCancelError(reason)));

    if (pair && controller) {
      // No `priority` option here on purpose: a task posted with one is pinned to that band for
      // life, and `setPriority` on the controller would silently stop moving it.
      pair.scheduler.postTask(fn, { delay: options?.delay, signal: controller.signal }).then(
        (value) => settle(() => resolve(value)),
        (reason: unknown) => settle(() => reject(reason as Error)),
      );
    } else {
      const timers = resolveTimers(options);
      const handle = timers.setTimeout(() => {
        settle(() => {
          try {
            resolve(fn());
          } catch (error) {
            reject(error as Error);
          }
        });
      }, options?.delay ?? 0);

      port.signal.addEventListener(
        'abort',
        () => {
          timers.clearTimeout(handle);
          settle(() => reject(port.signal.reason as Error));
        },
        { once: true },
      );
    }

    // Forwarded last, so an already-aborted signal reaches a task that is fully wired up.
    detach = forwardAborts(normalizeSignals(options?.signal), port);
  });

  Object.defineProperty(promise, 'priority', {
    get: (): TTaskPriority => (controller ? controller.signal.priority : ownPriority),
    set: (value: TTaskPriority) => {
      if (controller) {
        controller.setPriority(value);
      } else {
        ownPriority = value;
      }
    },
    configurable: true,
  });

  return promise as ISchedulerTaskPromise<T>;
}

function noop(): void {
  /* nothing to undo */
}

function normalizeSignals(signal?: AbortSignal | AbortSignal[]): AbortSignal[] {
  if (!signal) {
    return [];
  }

  return Array.isArray(signal) ? signal : [signal];
}

/**
 * Wire a caller's lifetimes onto the task's own controller and return the undo. Listeners are
 * removed the moment the task settles, so a long-lived signal does not accumulate one listener per
 * task posted under it.
 */
function forwardAborts(signals: AbortSignal[], port: AbortController): () => void {
  const alreadyAborted = signals.find((signal) => signal.aborted);

  if (alreadyAborted) {
    port.abort(alreadyAborted.reason);

    return noop;
  }

  const wired = signals.map((signal) => {
    const onAbort = (): void => port.abort(signal.reason);

    signal.addEventListener('abort', onAbort);

    return { signal, onAbort };
  });

  return () => {
    for (const { signal, onAbort } of wired) {
      signal.removeEventListener('abort', onAbort);
    }
  };
}

function toCancelError(reason?: unknown): CancelError {
  if (isCancelError(reason)) {
    return reason;
  }

  if (reason === undefined || typeof reason === 'string') {
    return new CancelError(reason);
  }

  return new CancelError(undefined, { cause: reason });
}
