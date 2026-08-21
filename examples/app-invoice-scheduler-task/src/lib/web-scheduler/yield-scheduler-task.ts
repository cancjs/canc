import { CancelablePromise } from '@cancjs/promise';

import { ISchedulerDeps, resolveScheduler, resolveTimers } from './deps';

/** Options for `yieldSchedulerTask`. Dependencies only: the platform's yield takes no arguments. */
export type IYieldSchedulerTaskOptions = ISchedulerDeps;

/**
 * Hand the thread back and continue afterwards, so a long stretch of work stops blocking input.
 *
 * The continuation goes to the FRONT of its priority queue, which is what separates this from
 * posting another task: work already in progress finishes before newly queued work starts. Where
 * the scheduler has no `yield` the continuation is scheduled through the timers pair instead, at
 * the back of the timer queue.
 *
 * A microtask is deliberately not part of that ladder. Queueing a microtask does not hand the
 * thread back at all, so falling back to one would keep the page frozen while claiming otherwise.
 *
 * Canceling rejects with a `CancelError`, and because the promise is already rejected by then, the
 * code after the yield never runs.
 */
export function yieldSchedulerTask(options?: IYieldSchedulerTaskOptions): CancelablePromise<void> {
  const pair = resolveScheduler(options);

  return new CancelablePromise<void>((resolve, reject, ctx) => {
    const yieldToScheduler = pair?.scheduler.yield;

    if (yieldToScheduler) {
      // A late resolve on a canceled promise is a no-op, so nothing else is needed to stop the
      // continuation: there is no queue entry to remove either, the platform owns it.
      yieldToScheduler.call(pair.scheduler).then(() => resolve(), reject);

      return;
    }

    const timers = resolveTimers(options);
    const handle = timers.setTimeout(() => resolve(), 0);

    ctx.handleCancel(() => timers.clearTimeout(handle));
  });
}
