import * as canc from '@cancjs/coroutine';
import { delay } from '@cancjs/toolbox';
import type { CancelablePromise } from '@cancjs/promise';

export interface Debounced<Args extends unknown[], Result> {
  (...args: Args): CancelablePromise<Result>;
  /** Cancel the pending call: the wait if it is still running, or the in-flight work if it started. */
  cancel(): void;
}

/**
 * A latest-wins debounce built on the cancelable `delay` from the toolbox. Each call cancels the
 * previous one: canceling the coroutine stops it at its current step, so it clears a pending timer
 * or aborts an in-flight request. The wrapped function must return a CancelablePromise.
 *
 * Prototyped here; a good candidate to graduate into @cancjs/toolbox.
 */
export function debounce<Args extends unknown[], Result>(
  ms: number,
  fn: (...args: Args) => CancelablePromise<Result>,
): Debounced<Args, Result> {
  let pending: CancelablePromise<Result> | undefined;

  const run = (...args: Args): CancelablePromise<Result> => {
    pending?.cancel();
    const task = canc.async(function* () {
      yield* canc.await(delay(ms));
      return yield* canc.await(fn(...args));
    })();
    pending = task;
    return task;
  };

  run.cancel = (): void => {
    pending?.cancel();
    pending = undefined;
  };

  return run;
}
