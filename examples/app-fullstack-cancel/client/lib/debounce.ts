import { delay } from '@cancjs/toolbox';
import type { CancelablePromise } from '@cancjs/promise';

export interface Debounced<Args extends unknown[], Result> {
  (...args: Args): CancelablePromise<Result>;
  /** Cancel the pending call (the wait, or the in-flight work if the wait already elapsed). */
  cancel(): void;
}

/**
 * A latest-wins debounce built on the cancelable `delay` from the toolbox. Each call cancels the
 * previous one: if the wait is still running it clears the timer, and if the wrapped call already
 * started it cancels that too. The wrapped function must return a CancelablePromise.
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
    const task = delay(ms).then(() => fn(...args)) as CancelablePromise<Result>;
    pending = task;
    return task;
  };

  run.cancel = (): void => {
    pending?.cancel();
    pending = undefined;
  };

  return run;
}
