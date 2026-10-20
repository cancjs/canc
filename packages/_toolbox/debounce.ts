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
};

/**
 * Debounced wrapper function: callable like the original, plus `cancel`, `flush`, and `isPending`.
 */
export interface IDebounced<Args extends unknown[], R, K extends IPromiseKind = IPromiseLikeKind, F = never> {
  (...args: Args): TPromiseOf<K, R, F>;
  cancel(reason?: any): void;
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
  // set while fn runs, so a call made from inside fn does not supersede the call being served
  invoking: boolean;
}

const ignore = (): void => undefined;

/**
 * Bind `debounce` to one promise implementation following the dependency-injection recipe.
 */
export function debounceFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IDebounceDeps) {
  /**
   * Debounce a function call by waiting for `ms` milliseconds of silence before invoking `fn`.
   */
  return function debounce<Args extends unknown[], R, F = never>(
    fn: (...args: Args) => TPromiseOf<K, R, F> | R | PromiseLike<R>,
    ms: number,
    options?: IDebounceOptions,
  ): IDebounced<Args, R, K, F> {
    const leading = options?.leading === true;
    const trailing = options?.trailing === false ? false : true;
    const maxWait: number | undefined = options != null ? options.maxWait : undefined;
    // the throttle shape, the only one that owes the next caller a full interval after a trailing invoke
    const rearmsWindow = maxWait === ms;
    const timers = resolveTimers(options, deps);

    let timerId: unknown;
    let maxTimerId: unknown;
    let lastArgs: Args | undefined;
    let lastThis: unknown;

    let pendingResolve: ((value: R | PromiseLike<R>) => void) | undefined;
    let pendingReject: ((reason?: any) => void) | undefined;
    let pendingPromise: TPromiseOf<K, R, F> | undefined;
    let cycle: ICycle<R> = { settled: false, leadingInvoked: false, invoking: false };
    let superseding = false;

    function markSettled(own: ICycle<R>): void {
      own.settled = true;
      own.result = undefined;
      // an idle wrapper would otherwise hold the last call's promise for its whole lifetime
      if (own === cycle) pendingPromise = undefined;
    }

    function remember(args: Args, receiver: unknown): void {
      lastArgs = args;
      lastThis = receiver;
    }

    function invoke(args: Args, thisArg: unknown): void {
      lastArgs = undefined;
      lastThis = undefined;

      // a superseded cycle must never write the live wrapper's state
      const own = cycle;
      // taken before fn runs, so a call made from inside fn cannot redirect this result
      const resolve = pendingResolve;
      const reject = pendingReject;
      pendingResolve = undefined;
      pendingReject = undefined;

      own.invoking = true;
      let result: R | PromiseLike<R>;
      try {
        // A flavor's promise type is opaque here, and a thenable by construction
        result = fn.apply(thisArg, args) as R | PromiseLike<R>;
      } catch (e) {
        own.invoking = false;
        if (reject) {
          reject(e);
        }
        markSettled(own);
        return;
      }
      own.invoking = false;

      own.result = isThenableLike<R>(result) ? result : undefined;

      if (resolve) {
        resolve(result);
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

    function cancelPending(reason?: any): void {
      superseding = true;
      if (pendingPromise && isCancelableLike(pendingPromise)) {
        pendingPromise.cancel(reason);
      } else if (pendingReject) {
        // Not-yet-invoked call on a non-cancelable Impl (native twin): the wrapper promise has no
        // cancel surface of its own, but reject is still live pre-invoke, so settle it directly.
        // Once invoke() has adopted a thenable this is already undefined and nothing can redirect
        // the promise, matching the native `withAbortSignal` stance of never faking a CancelError.
        // Branded, not a bare Error, so a caller can tell supersede from a real failure
        // a fire-and-forget debounced(x) needs its own handler now, or it goes unhandled
        pendingReject(Object.assign(new SupersededError(), { cause: reason }));
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
    function cancelCurrent(reason?: any): void {
      if (isCancelableLike(cycle.result)) {
        cycle.result.cancel(reason);
      }
      cycle.result = undefined;
      cancelPending(reason);
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
        invoke(lastArgs, lastThis);
        rearmWindow();
      } else if (lastArgs) {
        lastArgs = undefined;
        lastThis = undefined;
        cancelPending();
      }
    }

    // otherwise the next call reads a closed window and leading-invokes inside the interval, and
    // the max window is anchored at the invoke so the next one lands a full interval later
    function rearmWindow(): void {
      if (!rearmsWindow || timerId !== undefined || maxTimerId !== undefined) return;

      timerId = startTimer(timerExpired, ms, timers);
      maxTimerId = startTimer(timerExpired, ms, timers);
    }

    function makePromise(): TPromiseOf<K, R, F> {
      const own: ICycle<R> = { settled: false, leadingInvoked: false, invoking: false };
      cycle = own;

      const p = construct<R, K, F>(
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
              lastThis = undefined;
              pendingResolve = undefined;
              pendingReject = undefined;
              pendingPromise = undefined;
            });
          }
        },
        options,
      );

      // a cancelable promise reports nothing for a cancel, a native one would report every
      // superseded call nobody subscribed to, and subscribers still see the rejection
      if (!isCancelableLike(p) && isThenableLike(p)) {
        p.then(undefined, ignore);
      }

      pendingPromise = p;
      return p;
    }

    const wrapped = function (this: unknown, ...argsArray: Args) {
      // a closed window decides the leading edge, not `!pendingPromise`
      // `pendingPromise` outlives its cycle, so it allowed one leading call per wrapper lifetime
      const startsWindow = timerId === undefined && maxTimerId === undefined;

      remember(argsArray, this);

      if (timerId !== undefined) {
        stopTimer(timerId, timers);
        timerId = undefined;
      }

      if (pendingPromise && !cycle.settled && !cycle.leadingInvoked && !cycle.invoking) {
        // a call that has not completed is superseded, a completed one is owed to its caller
        // not `wrapped.cancel()`, which also clears `maxTimerId` and restarts the maxWait window
        cancelCurrent();
      }

      const promise = makePromise();

      if (leading && startsWindow) {
        // armed even with `trailing: false`, because only its expiry closes the window, and
        // before fn runs so a call made from inside fn sees the window already open
        timerId = startTimer(timerExpired, ms, timers);
        if (maxWait !== undefined && maxTimerId === undefined) {
          maxTimerId = startTimer(timerExpired, maxWait, timers);
        }
        cycle.leadingInvoked = true;
        invoke(argsArray, this);
        return promise;
      }

      timerId = startTimer(timerExpired, ms, timers);
      if (maxWait !== undefined && maxTimerId === undefined) {
        maxTimerId = startTimer(timerExpired, maxWait, timers);
      }

      return promise;
    } as unknown as IDebounced<Args, R, K, F>;

    wrapped.cancel = function (reason?: any): void {
      clearTimers();
      lastArgs = undefined;
      lastThis = undefined;
      cancelCurrent(reason);
    };

    wrapped.flush = function (): TPromiseOf<K, R, F> | undefined {
      if ((timerId === undefined && maxTimerId === undefined) || pendingPromise === undefined) return undefined;

      const args = lastArgs;
      const thisArg = lastThis;
      // read before invoking, because a call that completes in this tick releases it
      const p = pendingPromise;
      clearTimers();

      if (args && trailing) {
        invoke(args, thisArg);
        rearmWindow();
      } else if (args) {
        lastArgs = undefined;
        lastThis = undefined;
        cancelPending();
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
