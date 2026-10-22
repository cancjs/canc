import { IExecutorCtx } from './construct';
import { constructTimed } from './construct-timed';
import { ILazyOn, IToolboxDeps, TCallDeps, TLazyOf } from './deps';
import { parseTimedArgs, resolveDuration, TDuration } from './duration';
import { isCancelableLike, isThenableLike, isThunk } from './guards';
import { followInput, isCountedInput, TReleaseInput, TTimedInput } from './input';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';
import { resolveTimers, startTimer, stopTimer } from './timers';

const ignore = (): void => undefined;

// the input is only adopted when the timer fires, so its rejection needs a handler from the start
function holdInput(input: unknown): TReleaseInput | undefined {
  if (!isThenableLike(input)) {
    return isCancelableLike(input) ? (reason?: any) => input.cancel(reason) : undefined;
  }

  try {
    return followInput(input, ignore, ignore);
  } catch {
    // adopting the input later surfaces the same throw as a rejection
    return undefined;
  }
}

/** Bind `delay` to one promise implementation and set of timers. */
export function delayFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  /**
   * `delay` is the SEQUENTIAL time helper: the timer runs, THEN the input is produced.
   * `delay(x, ms)` is `delay(ms).then(() => x)`, never a floor - `minDelay` is the floor. A
   * function input is called only AFTER the timer fires, the opposite of `minDelay`/`timeout`
   * (whose input is already in flight when the bound is applied), so a thunk whose timer was
   * canceled first never runs at all, and a thunk that throws rejects the returned promise instead
   * of throwing synchronously out of `delay` itself. A promise input is likewise never observed
   * before the timer completes: a rejection at 10ms surfaces only once `ms` has elapsed, held back
   * rather than reported early - the reason `minDelay` (fails fast) exists alongside this one.
   *
   * A bare timer declares no failure set, having no input to take one from. With an input, the
   * declared set is the input's, held back like everything else until the timer completes.
   *
   * Canceling the returned promise gives up an input passed as a value. A cancelable promise is
   * canceled only when `delay` was its last consumer, any other cancelable is canceled directly, without a reason.
   */
  function delay<T = void>(ms: TDuration, options: K['options'] & TCallDeps & ILazyOn): TLazyOf<K, T>;
  function delay<T = void>(ms: TDuration, options?: K['options'] & TCallDeps): TPromiseOf<K, T>;
  function delay<T, F = never>(
    input: TTimedInput<T, K, F>,
    ms: TDuration,
    options: K['options'] & TCallDeps & ILazyOn,
  ): TLazyOf<K, T, F>;
  function delay<T, F = never>(
    input: TTimedInput<T, K, F>,
    ms: TDuration,
    options?: K['options'] & TCallDeps,
  ): TPromiseOf<K, T, F>;
  function delay<T, F = never>(...rest: unknown[]): TPromiseOf<K, T, F> | TLazyOf<K, T, F> {
    const parsed = parseTimedArgs<TTimedInput<T>>(rest);
    // Resolved (and, for a `[min, max]` range, rolled) BEFORE construct() runs the executor, so a
    // malformed range throws synchronously out of this call instead of becoming a rejection.
    const ms = resolveDuration(parsed.duration);
    const { hasInput, input, options } = parsed;
    const timers = resolveTimers(options, deps);
    // only an eager input is held: a thunk has nothing in flight until it runs
    let releaseInput = hasInput && !isThunk(input) ? holdInput(input) : undefined;

    return constructTimed<T, K, F>(
      deps,
      (resolve, reject, ctx?: IExecutorCtx) => {
        const fire = (): void => {
          if (!hasInput) {
            resolve(undefined as unknown as T);

            return;
          }

          if (isThunk<T>(input)) {
            try {
              resolve(input());
            } catch (error) {
              reject(error);
            }

            return;
          }

          if (releaseInput && isCountedInput(input)) {
            // adopting through `resolve` would add a consumer no cancel could release
            const held = releaseInput;
            releaseInput = followInput<T>(input, resolve, reject);
            held();

            return;
          }

          resolve(input as T | PromiseLike<T>);
        };

        const handle = startTimer(fire, ms, timers);

        if (ctx) {
          ctx.handleCancel(() => {
            stopTimer(handle, timers);
            releaseInput?.();
          });
        }
      },
      options,
    );
  }

  return delay;
}
