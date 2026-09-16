import { isSupersededError, SupersededError } from '../_util';
import { construct, IExecutorCtx, TPromiseCtor } from './construct';
import { TCallDeps } from './deps';
import { isCancelableLike, isThenableLike } from './guards';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';
import { resolveTimers, startTimer, stopTimer, TTimersOverride } from './timers';

export { isSupersededError, SupersededError };

/**
 * Options for `debounce`. The timer always runs immediately, so `lazy` is rejected at compile time.
 */
export type IDebounceOptions = TCallDeps & {
  leading?: boolean;
  trailing?: boolean;
  maxWait?: number;
  /** The debounce timer always runs immediately, so a `lazy` flag would be accepted and ignored. */
  lazy?: never;
  [key: string]: unknown;
};

/**
 * Debounced wrapper function: callable like the original, plus `cancel`, `flush`, and `isPending`.
 */
export interface IDebounced<Args extends unknown[], R, K extends IPromiseKind = IPromiseLikeKind, F = never> {
  (...args: Args): TPromiseOf<K, R, F>;
  cancel(): void;
  flush(): TPromiseOf<K, R, F> | undefined;
  readonly isPending: boolean;
}

/**
 * Dependency bag for `debounceFactory`, accepting the promise implementation and optional timer overrides.
 */
export type IDebounceDeps = TTimersOverride & {
  Impl: TPromiseCtor;
};

// per-call state, so a superseded cycle keeps owning the call it started and nothing else
interface ICycle<R> {
  result?: PromiseLike<R>;
  settled: boolean;
  // the leading edge is a commitment to the caller that opened the window, never taken back
  leadingInvoked: boolean;
}

/**
 * Bind `debounce` to one promise implementation following the dependency-injection recipe.
 */
export function debounceFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IDebounceDeps) {
  /**
   * Debounce a function call by waiting for `ms` milliseconds of silence before invoking `fn`.
   */
  return function debounce<Args extends unknown[], R, F = never>(
    fn: (...args: Args) => R | PromiseLike<R>,
    ms: number,
    options?: IDebounceOptions,
  ): IDebounced<Args, R, K, F> {
    const leading = options?.leading === true;
    const trailing = options?.trailing === false ? false : true;
    const maxWait: number | undefined = options != null ? options.maxWait : undefined;
    const timers = resolveTimers(options, deps);

    let timerId: unknown;
    let maxTimerId: unknown;
    let lastArgs: Args | undefined;

    let pendingResolve: ((value: R | PromiseLike<R>) => void) | undefined;
    let pendingReject: ((reason?: any) => void) | undefined;
    let pendingPromise: TPromiseOf<K, R, F> | undefined;
    let cycle: ICycle<R> = { settled: false, leadingInvoked: false };
    let superseding = false;

    function markSettled(own: ICycle<R>): void {
      own.settled = true;
      own.result = undefined;
      // an idle wrapper would otherwise hold the last call's promise for its whole lifetime
      if (own === cycle) pendingPromise = undefined;
    }

    function invoke(args: Args): void {
      lastArgs = undefined;

      // a superseded cycle must never write the live wrapper's state
      const own = cycle;

      let result: R | PromiseLike<R>;
      try {
        result = fn(...args);
      } catch (e) {
        if (pendingReject) {
          pendingReject(e);
          pendingResolve = undefined;
          pendingReject = undefined;
        }
        markSettled(own);
        return;
      }

      own.result = isThenableLike<R>(result) ? result : undefined;

      if (pendingResolve) {
        pendingResolve(result);
        pendingResolve = undefined;
        pendingReject = undefined;
      }

      if (isThenableLike<R>(result)) {
        result.then(
          function () {
            markSettled(own);
          },
          function () {
            markSettled(own);
          },
        );
      } else {
        // nothing to wait for, so the call completed in this tick
        markSettled(own);
      }
    }

    function clearTimers(): void {
      if (timerId !== undefined) {
        stopTimer(timerId, timers);
        timerId = undefined;
      }
      if (maxTimerId !== undefined) {
        stopTimer(maxTimerId, timers);
        maxTimerId = undefined;
      }
    }

    function cancelPending(): void {
      superseding = true;
      if (pendingPromise && isCancelableLike(pendingPromise)) {
        pendingPromise.cancel();
      } else if (pendingReject) {
        // a non-cancelable Impl has no cancel surface, so reject rather than leave it pending
        pendingReject(new SupersededError());
      }
      superseding = false;
      pendingResolve = undefined;
      pendingReject = undefined;
      pendingPromise = undefined;
    }

    /**
     * Cancel whatever the current cycle is: an in-flight call's cancelable result, plus the
     * wrapper promise handed to that call's caller. Shared by an explicit `.cancel()` and a
     * superseding call so both stop the same in-flight work the same way, whether the prior call
     * already invoked `fn` or is still waiting out the timer. An explicit `.cancel()` always gets
     * here; a superseding call only for a prior call that has not completed.
     */
    function cancelCurrent(): void {
      if (isCancelableLike(cycle.result)) {
        cycle.result.cancel();
      }
      cycle.result = undefined;
      cancelPending();
    }

    function timerExpired(): void {
      if (timerId !== undefined) {
        stopTimer(timerId, timers);
        timerId = undefined;
      }
      if (maxTimerId !== undefined) {
        stopTimer(maxTimerId, timers);
        maxTimerId = undefined;
      }

      if (trailing && lastArgs) {
        invoke(lastArgs);
      } else if (lastArgs) {
        cancelPending();
      }
    }

    function makePromise(): TPromiseOf<K, R, F> {
      const own: ICycle<R> = { settled: false, leadingInvoked: false };
      cycle = own;

      const p = construct<R>(
        deps.Impl,
        function (resolve, reject, ctx?: IExecutorCtx) {
          pendingResolve = resolve;
          pendingReject = reject;

          if (ctx) {
            ctx.handleCancel(function () {
              if (superseding) return;
              if (isCancelableLike(own.result)) {
                own.result.cancel();
              }
              own.result = undefined;
              // a superseded cycle owns the call it started, never the wrapper's current state
              if (own !== cycle) return;
              clearTimers();
              lastArgs = undefined;
              pendingResolve = undefined;
              pendingReject = undefined;
              pendingPromise = undefined;
            });
          }
        },
        options,
      );

      pendingPromise = p;
      return p;
    }

    const wrapped = function (...argsArray: Args) {
      // a closed window decides the leading edge, not `!pendingPromise`
      // `pendingPromise` outlives its cycle, so it allowed one leading call per wrapper lifetime
      const startsWindow = timerId === undefined && maxTimerId === undefined;

      lastArgs = argsArray;

      if (timerId !== undefined) {
        stopTimer(timerId, timers);
        timerId = undefined;
      }

      if (pendingPromise && !cycle.settled && !cycle.leadingInvoked) {
        // a call that has not completed is superseded, a completed one is owed to its caller
        // not `wrapped.cancel()`, which also clears `maxTimerId` and restarts the maxWait window
        cancelCurrent();
      }

      const promise = makePromise();

      if (leading && startsWindow) {
        invoke(argsArray);
        cycle.leadingInvoked = true;
        // armed even with `trailing: false`, because only its expiry closes the window
        timerId = startTimer(timerExpired, ms, timers);
        if (maxWait !== undefined && maxTimerId === undefined) {
          maxTimerId = startTimer(timerExpired, maxWait, timers);
        }
        return promise;
      }

      timerId = startTimer(timerExpired, ms, timers);
      if (maxWait !== undefined && maxTimerId === undefined) {
        maxTimerId = startTimer(timerExpired, maxWait, timers);
      }

      return promise;
    } as unknown as IDebounced<Args, R, K, F>;

    wrapped.cancel = function (): void {
      clearTimers();
      lastArgs = undefined;
      cancelCurrent();
    };

    wrapped.flush = function (): TPromiseOf<K, R, F> | undefined {
      if ((timerId === undefined && maxTimerId === undefined) || pendingPromise === undefined) return undefined;

      const args = lastArgs;
      // read before invoking, because a call that completes in this tick releases it
      const p = pendingPromise;
      clearTimers();

      if (args) {
        invoke(args);
      }

      pendingPromise = undefined;
      return p;
    };

    Object.defineProperty(wrapped, 'isPending', {
      get: function () {
        return timerId !== undefined || maxTimerId !== undefined;
      },
    });

    return wrapped;
  };
}
