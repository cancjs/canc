import { construct, IExecutorCtx } from './construct';
import { IToolboxDeps } from './deps';
import { isDurationShaped, resolveDuration, TDuration } from './duration';
import { IEagerSource, startInput, TTimedInput } from './input';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';
import { startTimer, stopTimer } from './timers';

/** Bind `minDelay` to one promise implementation and set of timers. */
export function minDelayFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  /**
   * `minDelay` is the parallel FLOOR: the input runs now, and its value is held back until at least
   * `ms` has elapsed. `minDelay(x, ms)` is `all([x, delay(ms)])`, which is what a spinner needs so
   * that a fast response does not flash. An input that settles after the floor adds no extra wait.
   *
   * A function input is called IMMEDIATELY, and a synchronous throw from it becomes a rejection
   * rather than an exception out of this call. That follows from the helper being parallel: a floor
   * under work that has not started yet would only be a timer, which is what `delay` already is.
   *
   * A rejection is never held. It propagates the moment it happens, so an error is reported as
   * early as it is known. That is the one behavior separating this from `delay`, whose sequential
   * shape holds everything until its timer completes.
   *
   * The input is required. Canceling the returned promise clears the floor timer and cancels the
   * input when it is cancelable.
   */
  return function minDelay<T>(input: TTimedInput<T>, ms: TDuration, options?: K['options']): TPromiseOf<K, T> {
    if (!isDurationShaped(ms)) {
      throw new TypeError('minDelay requires an input and a duration; a bare timer is delay(ms)');
    }

    // Rolled (and validated) before construct() runs the executor so a malformed range throws out
    // of this call instead of being swallowed into a rejection.
    const floor = resolveDuration(ms);

    return construct<T, K>(
      deps.Impl,
      (resolve, reject, ctx?: IExecutorCtx) => {
        let started: IEagerSource<T>;

        try {
          started = startInput<T>(input);
        } catch (error) {
          reject(error);

          return;
        }

        let elapsed = false;
        let value: T;
        let settled = false;

        const handle = startTimer(
          () => {
            elapsed = true;
            if (settled) resolve(value);
          },
          floor,
          deps,
        );

        if (ctx) {
          ctx.handleCancel(() => {
            stopTimer(handle, deps);
            started.cancelable?.cancel();
          });
        }

        deps.Impl.resolve(started.source).then(
          (result: T) => {
            value = result;
            settled = true;
            if (elapsed) resolve(value);
          },
          (reason: any) => {
            // Rejections short-circuit the floor: no reason to hold an error back.
            stopTimer(handle, deps);
            reject(reason);
          },
        );
      },
      options,
    );
  };
}
