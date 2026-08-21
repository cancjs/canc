import { ISchedulerDeps, resolveScheduler, resolveTimers } from './deps';
import { DEFAULT_PRIORITY } from './task-signal';
import { ITaskController, ITimers, TTaskPriority } from './types';

/** Options for `createSchedulerTimers`. */
export type ICreateSchedulerTimersOptions = ISchedulerDeps & {
  /** Band every timer created by this pair resumes in. */
  priority?: TTaskPriority;
};

/**
 * Build a timers pair backed by the scheduler, ready to hand to any helper that accepts one:
 * `delay`, `timeout`, `retry`, `waitFor`, `debounce`, `throttle`. None of them has to know a
 * scheduler exists.
 *
 * What this buys over the built-in timers: the resumption happens in a chosen band instead of one
 * undifferentiated timer queue, a pending resumption can still be reprioritized, a long wait
 * needs no chunking because the delay is not capped at a signed 32 bit integer, and clearing a
 * timer removes the entry from the queue rather than leaving an opaque callback behind.
 *
 * The honest limits: a hidden tab throttles both kinds of timer, the background band has no
 * specified protection against starvation, and where no scheduler exists (Safari today, node) this
 * is exactly the platform timers pair with the priority meaning nothing.
 */
export function createSchedulerTimers(options?: ICreateSchedulerTimersOptions): ITimers {
  return {
    setTimeout(handler, ms) {
      const pair = resolveScheduler(options);

      if (!pair) {
        return resolveTimers(options).setTimeout(handler, ms);
      }

      const controller = new pair.TaskController({ priority: options?.priority ?? DEFAULT_PRIORITY });

      // Clearing a timer aborts the task, and the scheduler reports that by rejecting. Nobody is
      // waiting on this promise, so the rejection is absorbed here instead of surfacing as an
      // unhandled rejection in a consumer that only ever called clearTimeout.
      pair.scheduler.postTask(handler, { delay: ms, signal: controller.signal }).catch(absorbAbort);

      return controller;
    },

    clearTimeout(handle) {
      if (isTaskController(handle)) {
        handle.abort();

        return;
      }

      resolveTimers(options).clearTimeout(handle);
    },
  };
}

function absorbAbort(): void {
  /* the only way this rejects is the clearTimeout above */
}

// A platform timer handle is a number in a browser and an object without `abort` in node, so the
// presence of `abort` tells a scheduler-backed handle from a timer one.
function isTaskController(handle: unknown): handle is ITaskController {
  return typeof (handle as ITaskController | undefined)?.abort === 'function';
}
