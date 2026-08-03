import { construct, IExecutorCtx, TPromiseCtor } from './construct';
import { isCancelableLike, isThenableLike } from './guards';

export interface IDebounceOptions {
  leading?: boolean;
  trailing?: boolean;
  maxWait?: number;
  /** The debounce timer always runs immediately, so a `lazy` flag would be accepted and ignored. */
  lazy?: never;
  [key: string]: unknown;
}

export interface IDebounced<Args extends unknown[], R> {
  (...args: Args): PromiseLike<R>;
  cancel(): void;
  flush(): PromiseLike<R> | undefined;
  readonly isPending: boolean;
}

export interface IDebounceDeps {
  Impl: TPromiseCtor;
}

export function debounceFactory(deps: IDebounceDeps) {
  return function debounce<Args extends unknown[], R>(
    fn: (...args: Args) => R | PromiseLike<R>,
    ms: number,
    options?: IDebounceOptions,
  ): IDebounced<Args, R> {
    const leading = options?.leading === true;
    const trailing = options?.trailing === false ? false : true;
    const maxWait: number | undefined = options != null ? options.maxWait : undefined;

    let timerId: ReturnType<typeof setTimeout> | undefined;
    let maxTimerId: ReturnType<typeof setTimeout> | undefined;
    let lastArgs: Args | undefined;

    let pendingResolve: ((value: R | PromiseLike<R>) => void) | undefined;
    let pendingReject: ((reason?: any) => void) | undefined;
    let pendingPromise: PromiseLike<R> | undefined;
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
        clearTimeout(timerId);
        timerId = undefined;
      }
      if (maxTimerId !== undefined) {
        clearTimeout(maxTimerId);
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
        clearTimeout(maxTimerId);
        maxTimerId = undefined;
      }

      if (trailing && lastArgs) {
        invoke(lastArgs);
      } else {
        pendingResolve = undefined;
        pendingReject = undefined;
      }
    }

    function makePromise(): PromiseLike<R> {
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
        clearTimeout(timerId);
        timerId = undefined;
      }

      if (!isFirstCall && pendingPromise && pendingResolve) {
        cancelPending();
      }

      const promise = makePromise();

      if (leading && isFirstCall) {
        invoke(argsArray);
        if (trailing) {
          timerId = setTimeout(timerExpired, ms);
        }
        if (maxWait !== undefined && maxTimerId === undefined) {
          maxTimerId = setTimeout(timerExpired, maxWait);
        }
        return promise;
      }

      timerId = setTimeout(timerExpired, ms);
      if (maxWait !== undefined && maxTimerId === undefined) {
        maxTimerId = setTimeout(timerExpired, maxWait);
      }

      return promise;
    } as unknown as IDebounced<Args, R>;

    wrapped.cancel = function (): void {
      clearTimers();
      lastArgs = undefined;
      if (isCancelableLike(inFlightResult)) {
        inFlightResult.cancel();
      }
      inFlightResult = undefined;
      cancelPending();
    };

    wrapped.flush = function (): PromiseLike<R> | undefined {
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
