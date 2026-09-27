import { construct, IExecutorCtx, TPromiseCtor } from './construct';
import { TCallDeps } from './deps';
import { isCancelableLike, isThenableLike } from './guards';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';
import { resolveTimers, startTimer, stopTimer, TTimersOverride } from './timers';

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
    let inFlightResult: PromiseLike<R> | undefined;
    let superseding = false;

    function invoke(args: Args): void {
      lastArgs = undefined;

      let result: R | PromiseLike<R>;
      try {
        result = fn(...args);
      } catch (e) {
        if (pendingReject) {
          pendingReject(e);
          pendingResolve = undefined;
          pendingReject = undefined;
        }
        return;
      }

      inFlightResult = isThenableLike<R>(result) ? result : undefined;

      if (pendingResolve) {
        pendingResolve(result);
        pendingResolve = undefined;
        pendingReject = undefined;
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
      }
      superseding = false;
      pendingResolve = undefined;
      pendingReject = undefined;
      pendingPromise = undefined;
    }

    function timerExpired(): void {
      timerId = undefined;
      if (maxTimerId !== undefined) {
        stopTimer(maxTimerId, timers);
        maxTimerId = undefined;
      }

      if (trailing && lastArgs) {
        invoke(lastArgs);
      } else {
        pendingResolve = undefined;
        pendingReject = undefined;
      }
    }

    function makePromise(): TPromiseOf<K, R, F> {
      const p = construct<R>(
        deps.Impl,
        function (resolve, reject, ctx?: IExecutorCtx) {
          pendingResolve = resolve;
          pendingReject = reject;

          if (ctx) {
            ctx.handleCancel(function () {
              if (superseding) return;
              clearTimers();
              lastArgs = undefined;
              pendingResolve = undefined;
              pendingReject = undefined;
              pendingPromise = undefined;
              if (isCancelableLike(inFlightResult)) {
                inFlightResult.cancel();
              }
              inFlightResult = undefined;
            });
          }
        },
        options,
      );

      pendingPromise = p;
      return p;
    }

    const wrapped = function (...argsArray: Args) {
      const isFirstCall = timerId === undefined && maxTimerId === undefined && !pendingPromise;

      lastArgs = argsArray;

      if (timerId !== undefined) {
        stopTimer(timerId, timers);
        timerId = undefined;
      }

      if (!isFirstCall && pendingPromise && pendingResolve) {
        cancelPending();
      }

      const promise = makePromise();

      if (leading && isFirstCall) {
        invoke(argsArray);
        if (trailing) {
          timerId = startTimer(timerExpired, ms, timers);
        }
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
      if (isCancelableLike(inFlightResult)) {
        inFlightResult.cancel();
      }
      inFlightResult = undefined;
      cancelPending();
    };

    wrapped.flush = function (): TPromiseOf<K, R, F> | undefined {
      if (timerId === undefined && maxTimerId === undefined) return undefined;

      const args = lastArgs;
      clearTimers();

      if (args) {
        invoke(args);
      }

      const p = pendingPromise;
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
