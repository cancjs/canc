import { TExecutorCtx } from './construct';
import { IToolboxDeps } from './deps';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';
import { constructTimed } from './lazy';
import { startTimer, stopTimer } from './timers';

export interface IWaitForOptions {
  /** Poll interval in milliseconds. Default: 20. */
  interval?: number;
  /** Reject with a plain Error after this many ms. Default: Infinity (no cap). */
  timeout?: number;
  /** Defer the first poll until the first subscription. Not contagious past a chained `.then`. */
  lazy?: boolean;
  [key: string]: unknown;
}

/** Bind `waitFor` to one promise implementation and set of timers. */
export function waitForFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  /**
   * Resolve once `condition` returns (or resolves to) a truthy value, polling every `interval`
   * milliseconds. When the implementation is cancelable-shaped, canceling clears the pending poll
   * timer. The condition may be sync or async; an async condition is awaited before the next poll is
   * scheduled, so slow conditions never overlap.
   */
  return function waitFor(condition: () => unknown, options?: IWaitForOptions): TPromiseOf<K, void> {
    const interval = options?.interval ?? 20;
    const limit = options?.timeout ?? Infinity;

    return constructTimed<void, K>(
      deps,
      (resolve, reject, ctx?: TExecutorCtx) => {
        let timerId: unknown;
        let deadlineId: unknown;
        let settled = false;

        const clearTimers = () => {
          if (timerId !== undefined) stopTimer(timerId, deps);
          if (deadlineId !== undefined) stopTimer(deadlineId, deps);
        };

        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimers();
          fn();
        };

        const poll = () => {
          if (settled) return;

          let result: unknown;
          try {
            result = condition();
          } catch (error) {
            finish(() => reject(error));
            return;
          }

          deps.Impl.resolve(result).then(
            (value: unknown) => {
              if (value) {
                finish(() => resolve());
              } else if (!settled) {
                timerId = startTimer(poll, interval, deps);
              }
            },
            (error: any) => finish(() => reject(error)),
          );
        };

        if (limit !== Infinity) {
          deadlineId = startTimer(() => finish(() => reject(new Error('waitFor timed out'))), limit, deps);
        }

        if (ctx) {
          ctx.handleCancel(() => {
            settled = true;
            clearTimers();
          });
        }

        poll();
      },
      options,
    );
  };
}
