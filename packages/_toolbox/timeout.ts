import { isTimeoutError, TimeoutError } from '../_util';
import { TExecutorCtx } from './construct';
import { constructTimed } from './construct-timed';
import { IToolboxDeps } from './deps';
import { parseTimedArgs, resolveDuration, TDuration } from './duration';
import { IEagerSource, startInput, TTimedInput } from './input';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';
import { startTimer, stopTimer } from './timers';

export { isTimeoutError, TimeoutError };

/** Bind `timeout` to one promise implementation and set of timers. */
export function timeoutFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  /**
   * `timeout` is the parallel CEILING: the input runs now and its settlement is adopted, unless the
   * deadline arrives first and rejects with a TimeoutError. `timeout(x, ms)` is
   * `race([x, timeout(ms)])`, the dual of `delay`. The bare `timeout(ms)` is that timer on its own,
   * which is what makes it worth racing by hand.
   *
   * A function input is called IMMEDIATELY, and a synchronous throw from it becomes a rejection
   * rather than an exception out of this call. A deadline only means something over work that is
   * already in flight.
   *
   * `ms` defaults to `Infinity`, which is a passthrough: no timer is scheduled at all, so an
   * optional deadline needs no branch at the call site. When the deadline does win and the input is
   * cancelable, the input is canceled with that same TimeoutError so it stops instead of running
   * detached. The timer is always cleared once the race settles.
   */
  function timeout(ms: TDuration, options?: K['options']): TPromiseOf<K, never>;
  function timeout<T>(input: TTimedInput<T>, ms?: TDuration, options?: K['options']): TPromiseOf<K, T>;
  function timeout<T>(...rest: unknown[]): TPromiseOf<K, T> {
    const parsed = parseTimedArgs<TTimedInput<T>>(rest, Infinity);
    // Resolved (and, for a `[min, max]` range, rolled) BEFORE construct() runs the executor, so a
    // malformed range throws synchronously out of this call instead of becoming a rejection.
    const ms = resolveDuration(parsed.duration);
    const { hasInput, input, options } = parsed;

    // The returned promise owns the timer so that canceling it (cancelable flavor) clears the
    // pending timeout and stops the underlying operation, leaving no leaked work. Under a plain
    // native Promise the context is undefined and the timer simply runs to completion.
    return constructTimed<T, K>(
      deps,
      (resolve, reject, ctx?: TExecutorCtx) => {
        let settled = false;
        let started: IEagerSource<T> | undefined;

        if (hasInput) {
          try {
            started = startInput<T>(input as TTimedInput<T>);
          } catch (error) {
            reject(error);

            return;
          }
        }

        const id = startTimer(
          () => {
            if (settled) return;
            settled = true;

            const error = new TimeoutError();

            // Deadline won: stop the underlying operation so it does not run detached, and report
            // the same error the caller sees as the reason it was stopped.
            started?.cancelable?.cancel(error);
            reject(error);
          },
          ms,
          deps,
        );

        if (ctx) {
          ctx.handleCancel(() => {
            settled = true;
            stopTimer(id, deps);
            started?.cancelable?.cancel();
          });
        }

        if (started) {
          deps.Impl.resolve(started.source).then(
            (value: T) => {
              if (settled) return;
              settled = true;
              stopTimer(id, deps);
              resolve(value);
            },
            (reason: any) => {
              if (settled) return;
              settled = true;
              stopTimer(id, deps);
              reject(reason);
            },
          );
        }
      },
      options,
    );
  }

  return timeout;
}
