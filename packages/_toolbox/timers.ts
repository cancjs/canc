/**
 * Timer scheduling for the toolbox helpers, with support for delays longer than the platform
 * limit.
 *
 * `setTimeout` keeps its delay in a signed 32 bit integer, so anything above 2^31-1 ms (about 24.8
 * days) overflows and the timer fires immediately. Durations that large are legitimate for `delay`,
 * `waitFor` and retry backoff, so a long delay is split into chunks of at most `MAX_TIMEOUT` and
 * rescheduled until the target time is reached.
 *
 * The chunking approach is adapted from the unlimited-timeout project by Sindre Sorhus, MIT
 * license. No code is copied from it.
 *
 * Interval chunking and node's `ref`/`unref` are deliberate omissions, not an unfinished port. Only
 * the fetch package polls on an interval and its period is always short, and a pending long timer
 * holding the event loop open is the behavior these helpers want.
 */

/** The largest delay `setTimeout` can hold, 2^31-1 ms (about 24.8 days). */
export const MAX_TIMEOUT = 2147483647;

/**
 * The timer functions a helper schedules against. Injecting a pair is how a consumer escapes its
 * own test suite's fake timers, the same need p-timeout covers with `customTimers`.
 */
export interface ITimers {
  setTimeout: (handler: () => void, ms?: number) => any;
  clearTimeout: (handle: any) => void;
}

const TIMER_BRAND = Symbol.for('@cancjs/toolbox:Timer');

/** The handle returned for a chunked timer. Short timers hand back the platform handle instead. */
interface ILongTimer {
  [TIMER_BRAND]: true;
  /** Handle of the chunk currently scheduled, or undefined when nothing is pending. */
  id: any;
  cleared: boolean;
}

/**
 * Feature-detected once, because unlike the timer functions the clock cannot be swapped underneath
 * a running timer. `Date.now()` follows the wall clock, so a system time adjustment (an NTP
 * correction, a manual change) shifts the remaining time of a multi-day timer.
 */
const readClock: () => number =
  typeof performance !== 'undefined' && performance && typeof performance.now === 'function' ?
    () => performance.now()
  : () => Date.now();

// The ambient timers are read at CALL time, not captured at module load. This is the opposite of
// the native Promise capture in the core package, and it is deliberate: capturing here would pin
// whatever `setTimeout` existed at import time, which breaks a consumer that installs fake timers
// afterwards. A suite that wants the real clock passes `timers` instead. Do not turn these into
// module-level constants. They are also read as bare identifiers rather than off a global object,
// so the module works in a browser, in node and in a worker alike.
function schedule(handler: () => void, ms: number, timers?: Partial<ITimers>): any {
  return timers?.setTimeout ? timers.setTimeout(handler, ms) : setTimeout(handler, ms);
}

function unschedule(handle: any, timers?: Partial<ITimers>): void {
  if (timers?.clearTimeout) {
    timers.clearTimeout(handle);
  } else {
    clearTimeout(handle);
  }
}

/** Coerce a delay the way the platform does: not a number or below zero means fire as soon as possible. */
function normalizeDelay(ms: number): number {
  const value = Number(ms);

  return isNaN(value) || value < 0 ? 0 : value;
}

/**
 * Schedule `handler` to run after `ms` milliseconds, chunking the wait when it exceeds what the
 * platform can hold. A delay of `Infinity`, or one beyond the safe integer range, schedules nothing
 * and never fires; the handle it returns is still valid for `stopTimer`.
 *
 * Pass the result to `stopTimer`, never to `clearTimeout`: a long timer's handle is not a platform
 * handle.
 */
export function startTimer(handler: () => void, ms: number, timers?: Partial<ITimers>): any {
  const total = normalizeDelay(ms);

  // The overwhelming majority of calls land here, so they get the platform handle untouched and
  // pay for no wrapper object.
  if (total <= MAX_TIMEOUT) {
    return schedule(handler, total, timers);
  }

  const timer: ILongTimer = { [TIMER_BRAND]: true, id: undefined, cleared: false };

  if (total > Number.MAX_SAFE_INTEGER) {
    return timer;
  }

  const target = readClock() + total;

  const runChunk = (): void => {
    if (timer.cleared) return;

    // Recomputed against the target rather than counted down, so a chunk that ran late shortens
    // the next one instead of pushing the whole timer past its deadline.
    const remaining = target - readClock();

    if (remaining <= 0) {
      timer.id = undefined;
      handler();

      return;
    }

    timer.id = schedule(runChunk, remaining > MAX_TIMEOUT ? MAX_TIMEOUT : remaining, timers);
  };

  runChunk();

  return timer;
}

/**
 * Cancel a timer started by `startTimer`. A missing handle is a no-op.
 */
export function stopTimer(handle: any, timers?: Partial<ITimers>): void {
  if (handle == null) return;

  // Brand check first: node's own timer handle is an object too, so "is it an object" tells the
  // two apart in a browser and nowhere else.
  if (handle[TIMER_BRAND] === true) {
    const timer = handle as ILongTimer;

    timer.cleared = true;

    if (timer.id !== undefined) {
      unschedule(timer.id, timers);
      timer.id = undefined;
    }

    return;
  }

  unschedule(handle, timers);
}
