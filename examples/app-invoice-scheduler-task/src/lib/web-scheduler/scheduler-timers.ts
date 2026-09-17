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
 * undifferentiated timer queue, a pending resumption can still be reprioritized, the pair itself
 * is not capped at 2^31-1ms (though the helpers still split a longer wait into chunks before it
 * reaches the pair), and clearing a timer removes the entry from the queue rather than leaving an
 * opaque callback behind.
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

      // postTask can reject in two ways: the controller signal aborts (from clearTimeout below),
      // or the handler itself throws. Only absorb the abort rejection; rethrow handler throws so
      // they surface like uncaught timer callbacks.
      pair.scheduler.postTask(handler, { delay: ms, signal: controller.signal }).catch((reason) => {
        if (!isOwnAbort(reason, controller.signal)) {
          // Rethrow via setTimeout to ensure the throw surfaces asynchronously as an unhandled
          // rejection, matching the behavior of a synchronous timer callback that throws.
          // The postTask promise resolves before the throw happens, so this doesn't block cleanup.
          setTimeout(() => {
            throw reason;
          });
        }
      });

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

function isOwnAbort(reason: unknown, signal: AbortSignal): boolean {
  return signal.aborted && reason === signal.reason;
}

// presence of abort distinguishes TaskController from platform timer handle
function isTaskController(handle: unknown): handle is ITaskController {
  return typeof (handle as ITaskController | undefined)?.abort === 'function';
}
