import type { ICancelablePromiseOptions } from '@cancjs/promise';

import type { IExecutorCtx, THandleCancel } from '../../_toolbox';

export type { IExecutorCtx, THandleCancel };

/**
 * Options accepted by every toolbox utility. These canc options (bubble, shield, signal, ...) are
 * forwarded to CancelablePromise construction.
 */
export interface IToolboxOptions extends ICancelablePromiseOptions {
  /**
   * Defer starting the work (the timer, the retry attempt, the poll, the callback invocation...)
   * until the first `then`/`catch`/`finally`/`await`. Supported by `delay`, `timeout`, `retry`,
   * `waitFor` and `promisify`. The helpers that always start eagerly (`minDelay`, `defer`,
   * `debounce`, `throttle` and `cancelify`) reject it at compile time.
   *
   * Laziness is NOT contagious: `delay(1000, { lazy: true }).then(f)` starts the timer at the
   * `.then` call, it does not defer `f` past anything further.
   */
  lazy?: boolean;
}

/**
 * Options for the helpers that always start their work immediately. Dropping `lazy` makes passing
 * it a compile error rather than a key that is accepted and then ignored.
 */
export type TEagerToolboxOptions = Omit<IToolboxOptions, 'lazy'>;

/**
 * The executor shape toolbox utilities construct against. It widens the native
 * `(resolve, reject)` signature with the CancelablePromise context object.
 */
export type TToolboxExecutor<T> = (
  resolve: (value: T | PromiseLike<T>) => void,
  reject: (reason?: any) => void,
  ctx?: IExecutorCtx,
) => void;
