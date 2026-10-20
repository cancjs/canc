import type { Unlisted } from '../_util';
import { isTimeoutError, TimeoutError } from '../_util';
import { IExecutorCtx } from './construct';
import { constructTimed } from './construct-timed';
import { IToolboxDeps, TCallDeps } from './deps';
import { parseTimedArgs, resolveDuration, TDuration } from './duration';
import { followInput, startInput, TReleaseInput, TTimedInput } from './input';
import { IPromiseKind, IPromiseLikeKind, TFailureOf, TPromiseOf, TValueOf } from './kind';
import { resolveTimers, startTimer, stopTimer } from './timers';

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
   * optional deadline needs no branch at the call site. When the deadline wins or the result is
   * canceled, `timeout` gives up its interest in the input. A cancelable promise input is canceled
   * when `timeout` was its only consumer, and keeps running for its other consumers otherwise. Any
   * other cancelable input is canceled directly, with the TimeoutError as the reason on a deadline.
   * The timer is always cleared once the race settles.
   */
  function timeout(ms: TDuration, options?: K['options'] & TCallDeps): TPromiseOf<K, never, TimeoutError | Unlisted>;
  function timeout<P extends PromiseLike<unknown>>(
    input: P | (() => P),
    ms?: TDuration,
    options?: K['options'] & TCallDeps,
  ): TPromiseOf<K, TValueOf<P>, TFailureOf<K, P> | TimeoutError | Unlisted>;
  function timeout<T, F = never>(
    input: TTimedInput<T>,
    ms?: TDuration,
    options?: K['options'] & TCallDeps,
  ): TPromiseOf<K, T, F | TimeoutError | Unlisted>;
  function timeout<T, F = never>(...rest: unknown[]): TPromiseOf<K, T, F | TimeoutError | Unlisted> {
    const parsed = parseTimedArgs<TTimedInput<T>>(rest, Infinity);
    // Resolved (and, for a `[min, max]` range, rolled) BEFORE construct() runs the executor, so a
    // malformed range throws synchronously out of this call instead of becoming a rejection.
    const ms = resolveDuration(parsed.duration);
    const { hasInput, input, options } = parsed;
    const timers = resolveTimers(options, deps);

    // Returned promise owns the timer so canceling the cancelable flavor clears pending timeout
    // stopping underlying operation while plain native Promise lets timer run to completion
    return constructTimed<T, K>(
      deps,
      (resolve, reject, ctx?: IExecutorCtx) => {
        let settled = false;
        let source: T | PromiseLike<T> | undefined;

        if (hasInput) {
          try {
            source = startInput<T>(input as TTimedInput<T>).source;
          } catch (error) {
            reject(error);

            return;
          }
        }

        let releaseInput: TReleaseInput | undefined;

        const id = startTimer(
          () => {
            if (settled) return;
            settled = true;

            const Ctor = options?.TimeoutError ?? deps.TimeoutError ?? TimeoutError;
            const error = new Ctor();

            // a sole-held input stops with the caller's error, a shared one keeps running
            releaseInput?.(error);
            reject(error);
          },
          ms,
          timers,
        );

        if (ctx) {
          ctx.handleCancel(() => {
            settled = true;
            stopTimer(id, timers);
            releaseInput?.();
          });
        }

        if (hasInput) {
          releaseInput = followInput(
            source as T | PromiseLike<T>,
            (value: T) => {
              if (settled) return;
              settled = true;
              stopTimer(id, timers);
              resolve(value);
            },
            (reason: any) => {
              if (settled) return;
              settled = true;
              stopTimer(id, timers);
              reject(reason);
            },
            deps.Impl,
          );
        }
      },
      options,
    );
  }

  return timeout;
}
