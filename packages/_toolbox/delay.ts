import { construct, TExecutorCtx } from './construct';
import { IToolboxDeps } from './deps';
import { parseTimedArgs, resolveDuration, TDuration } from './duration';
import { isCancelableLike } from './guards';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';
import { startTimer, stopTimer } from './timers';

/** What `delay` accepts as its input: a plain value, a promise, or a thunk producing either. */
export type TDelayInput<T> = T | PromiseLike<T> | (() => T | PromiseLike<T>);

function isThunk<T>(input: unknown): input is () => T | PromiseLike<T> {
  return typeof input === 'function';
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
   */
  function delay<T = void>(ms: TDuration, options?: K['options']): TPromiseOf<K, T>;
  function delay<T>(input: TDelayInput<T>, ms: TDuration, options?: K['options']): TPromiseOf<K, T>;
  function delay<T>(...rest: unknown[]): TPromiseOf<K, T> {
    const parsed = parseTimedArgs<TDelayInput<T>>(rest);
    // Resolved (and, for a `[min, max]` range, rolled) BEFORE construct() runs the executor, so a
    // malformed range throws synchronously out of this call instead of becoming a rejection.
    const ms = resolveDuration(parsed.duration);
    const { hasInput, input, options } = parsed;
    // A cancelable value/promise supplied eagerly (not via a thunk - nothing is in flight for a
    // thunk until it runs) is canceled if the returned promise is canceled first.
    const eagerCancelable = hasInput && !isThunk(input) && isCancelableLike(input) ? input : undefined;

    return construct<T, K>(
      deps.Impl,
      (resolve, reject, ctx?: TExecutorCtx) => {
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

          resolve(input as T | PromiseLike<T>);
        };

        const handle = startTimer(fire, ms, deps);

        if (ctx) {
          ctx.handleCancel(() => {
            stopTimer(handle, deps);
            eagerCancelable?.cancel();
          });
        }
      },
      options,
    );
  }

  return delay;
}
