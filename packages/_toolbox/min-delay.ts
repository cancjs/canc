import { construct, TExecutorCtx } from './construct';
import { IToolboxDeps } from './deps';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';
import { startTimer, stopTimer } from './timers';

/** Bind `minDelay` to one promise implementation and set of timers. */
export function minDelayFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  /**
   * Resolve with the value of `promise`, but never before `ms` milliseconds have elapsed. Useful for
   * enforcing a minimum visible duration on a spinner or transition. If `promise` rejects, the
   * rejection propagates immediately without waiting out the delay. When the implementation is
   * cancelable-shaped, canceling clears the pending floor timer.
   */
  return function minDelay<T>(promise: T | PromiseLike<T>, ms: number, options?: K['options']): TPromiseOf<K, T> {
    return construct<T, K>(
      deps.Impl,
      (resolve, reject, ctx?: TExecutorCtx) => {
        let elapsed = false;
        let value: T;
        let settled = false;

        const id = startTimer(
          () => {
            elapsed = true;
            if (settled) resolve(value);
          },
          ms,
          deps,
        );

        if (ctx) {
          ctx.handleCancel(() => stopTimer(id, deps));
        }

        deps.Impl.resolve(promise).then(
          (result: T) => {
            value = result;
            settled = true;
            if (elapsed) resolve(value);
          },
          (reason: any) => {
            // Rejections short-circuit the floor: no reason to hold an error back.
            stopTimer(id, deps);
            reject(reason);
          },
        );
      },
      options,
    );
  };
}
