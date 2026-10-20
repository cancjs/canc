import * as nodeTimersPromises from 'node:timers/promises';

import { CancelablePromise } from '@cancjs/promise';

import timersJson from '../../surface/projected/timers.json';
import { acceptsSignal, IManifestEntry, liftCallerSignal, withCallerSignal, withSignal } from '../signal';

const entries = new Map<string, IManifestEntry>(
  timersJson.exports.map((entry) => [entry.name, entry as IManifestEntry]),
);

/** Node's timer options: `{ ref, signal }`. */
export interface ITimersOptions {
  /** Set to false to let a pending timer skip holding the event loop open. Default true. */
  ref?: boolean;
  /** A signal of the caller's own. Its abort cancels the returned promise, same as calling `cancel()`. */
  signal?: AbortSignal;
}

/** `scheduler.wait`'s options: `ref` is not supported here, only `signal`. */
export interface ISchedulerWaitOptions {
  signal?: AbortSignal;
}

// name check only: node's AbortError comes from another realm, so `instanceof Error` misses it
function isAbortName(error: unknown): boolean {
  return (error as { name?: unknown } | null)?.name === 'AbortError';
}

const setTimeoutEntry = entries.get('setTimeout');
const setImmediateEntry = entries.get('setImmediate');
const waitEntry = entries.get('wait');

/**
 * Cancelable `setTimeout`. Category C (trivial): canceling clears the timer, which costs nothing.
 * Ships for drop-in symmetry with `node:timers/promises`. For most call sites `delay` from
 * `@cancjs/toolbox` is the idiomatic choice; reach for this one when porting code that already
 * calls `node:timers/promises` directly, or when `ref: false` is needed.
 */
export function setTimeout<T = void>(delay?: number, value?: T, options?: ITimersOptions): CancelablePromise<T, never> {
  const call = liftCallerSignal(options);

  return withCallerSignal<T, never>(call.callerSignal, acceptsSignal(setTimeoutEntry), (signal) =>
    nodeTimersPromises.setTimeout<T>(
      delay,
      value,
      signal ? (withSignal(call.options, signal) as ITimersOptions) : call.options,
    ),
  );
}

/**
 * Cancelable `setImmediate`. Category C (trivial): canceling clears the queued immediate.
 * Same drop-in-symmetry reasoning as {@link setTimeout}.
 */
export function setImmediate<T = void>(value?: T, options?: ITimersOptions): CancelablePromise<T, never> {
  const call = liftCallerSignal(options);

  return withCallerSignal<T, never>(call.callerSignal, acceptsSignal(setImmediateEntry), (signal) =>
    nodeTimersPromises.setImmediate<T>(
      value,
      signal ? (withSignal(call.options, signal) as ITimersOptions) : call.options,
    ),
  );
}

/**
 * The iterator {@link setInterval} returns: an async iterable with one addition, `cancel()`.
 */
export interface ICancelableIntervalIterator<T> extends AsyncIterableIterator<T> {
  /**
   * Ends iteration and clears the underlying interval. Delegates to the iterator protocol's own
   * `return()`, which is what node already uses to clear the timer when a `for await` loop breaks,
   * so iteration ends cleanly and nothing throws into the loop.
   */
  cancel(): void;
}

/**
 * Iterate values on an interval of `delay` ms. Category C (trivial): canceling clears the timer.
 *
 * Returns an async iterable, not a promise, so there is nothing to `.then()`. Stop it by calling
 * `cancel()`, or simply `break` out of a `for await` loop over it; node calls `return()` on the
 * iterator either way and clears the timer.
 *
 * A caller-supplied `options.signal` is passed straight through to node, unmodified: node already
 * ends the iteration and clears the timer when it aborts.
 */
export function setInterval<T = number>(
  delay?: number,
  value?: T,
  options?: ITimersOptions,
): ICancelableIntervalIterator<T> {
  const cancelation = new AbortController();
  const signal = options?.signal ? AbortSignal.any([options.signal, cancelation.signal]) : cancelation.signal;
  const source = nodeTimersPromises.setInterval<T>(delay, value, { ...options, signal }) as unknown as AsyncIterator<T>;
  let canceled = false;

  async function stop(): Promise<IteratorResult<T>> {
    canceled = true;
    cancelation.abort();
    try {
      await source.return?.(undefined as unknown as T);
    } catch (error) {
      // the abort already cleared the timer; node reports AbortError, which is not a failure
      if (!isAbortName(error)) {
        throw error;
      }
    }
    return { value: undefined, done: true };
  }

  const iterator: ICancelableIntervalIterator<T> = {
    async next(): Promise<IteratorResult<T>> {
      try {
        return await source.next();
      } catch (error) {
        // node rejects a pending pull with AbortError on abort; cancel() reads that as done
        if (canceled && isAbortName(error)) {
          return { value: undefined, done: true };
        }
        throw error;
      }
    },
    return: stop,
    [Symbol.asyncIterator](): ICancelableIntervalIterator<T> {
      return iterator;
    },
    cancel(): void {
      void stop();
    },
  };

  return iterator;
}

/**
 * `scheduler.wait`. Category C (trivial), same shape as {@link setTimeout} minus a `value` and
 * minus `ref` (node's own type does not offer it for this call).
 */
function schedulerWait(delay: number, options?: ISchedulerWaitOptions): CancelablePromise<void, never> {
  const call = liftCallerSignal(options);

  return withCallerSignal<void, never>(call.callerSignal, acceptsSignal(waitEntry), (signal) =>
    nodeTimersPromises.scheduler.wait(
      delay,
      signal ? (withSignal(call.options, signal) as ISchedulerWaitOptions) : call.options,
    ),
  );
}

/**
 * Mirrors `node:timers/promises`' `scheduler` namespace. `wait` is wrapped like {@link setTimeout};
 * `yield` takes no options at all, so it is node's own function, unwrapped and not cancelable.
 */
export const scheduler = {
  wait: schedulerWait,
  // bound: node's own `yield` reads internal state off `this`, which a plain property copy loses
  yield: nodeTimersPromises.scheduler.yield.bind(nodeTimersPromises.scheduler),
};
