import { IExecutorCtx } from './construct';
import { constructTimed } from './construct-timed';
import { IToolboxDeps, TCallDeps } from './deps';
import { resolveDuration } from './duration';
import { isCancelableLike, isThenableLike } from './guards';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';
import { readClock, resolveTimers, startTimer, stopTimer } from './timers';

/** Per-failure context handed to `shouldRetry`, `delay` and available for `onRetry` to derive from. */
export interface IRetryContext {
  /** 1-based number of the attempt that just failed. */
  attempt: number;
  /** Attempts still allowed after this one. */
  retriesLeft: number;
  /** Milliseconds since the first attempt started (monotonic where available). */
  elapsed: number;
}

export type IRetryOptions<K extends IPromiseKind = IPromiseLikeKind> = K['options'] &
  TCallDeps & {
    /** Attempts AFTER the first call. Default: 3 (so up to 4 calls total). */
    retries?: number;
    /** Wait before the first retry, in ms. Default: 300. */
    initialDelay?: number;
    /** Upper bound on any SINGLE wait, in ms. Default: 30000. */
    maxDelay?: number;
    /** Multiplier applied per attempt. `1` means a constant wait. Default: 2. */
    factor?: number;
    /**
     * `false` (default) waits exactly the computed delay. `true` picks uniformly in `[0, computed)`
     * (full jitter). A number `f` picks uniformly in `[computed*(1-f), computed*(1+f))`, clamped at
     * 0. `maxDelay` is applied to the base delay BEFORE jitter, so a jittered wait can exceed
     * `maxDelay` by up to a factor of `(1 + f)`. A negative `f` inverts the range and rejects the
     * retry with a `RangeError`.
     */
    jitter?: boolean | number;
    /** Decide per failure. May be async. Returning false rejects with that reason immediately. */
    shouldRetry?: (reason: any, ctx: IRetryContext) => boolean | PromiseLike<boolean>;
    /** Override the computed wait. Returning undefined accepts `computedDelay` verbatim, unclamped. */
    delay?: (ctx: IRetryContext & { computedDelay: number }) => number | undefined;
    /** Called before each wait, with the delay actually about to be waited. */
    onRetry?: (reason: any, attempt: number, delay: number) => void;
    /** Defer the first attempt until the first subscription. Not contagious past a chained `.then`. */
    lazy?: boolean;
    /** @deprecated Use `initialDelay`. Removed in the next major. */
    minTimeout?: number;
    /** @deprecated Use `maxDelay`. Removed in the next major. */
    maxTimeout?: number;
  };

function applyJitter(base: number, jitter: boolean | number): number {
  if (jitter === false) {
    return base;
  }

  if (jitter === true) {
    return resolveDuration([0, base]);
  }

  const lo = Math.max(0, base * (1 - jitter));
  const hi = base * (1 + jitter);

  return resolveDuration([lo, hi]);
}

/** Bind `retry` to one promise implementation and set of timers. */
export function retryFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  /**
   * Retry an async operation with exponential backoff. `input` is invoked once per attempt and its
   * rejection triggers a backoff wait before the next attempt, up to `retries` further attempts.
   * The backoff wait and each attempt are built against the bound implementation, so when that
   * implementation is cancelable-shaped, canceling the returned promise stops a pending backoff
   * wait, cancels an in-flight attempt, and aborts a pending async `shouldRetry` without scheduling
   * another attempt; a plain native Promise has no cancellation and simply runs to its retry budget.
   *
   * A throw from `shouldRetry`, `delay` or `onRetry` rejects the returned promise with that error
   * and starts no further attempt.
   */
  return function retry<T, F = never>(
    input: (attempt: number) => T | PromiseLike<T>,
    options?: IRetryOptions<K>,
  ): TPromiseOf<K, T, F> {
    const retries = options?.retries ?? 3;
    const initialDelay = options?.initialDelay ?? options?.minTimeout ?? 300;
    const maxDelay = options?.maxDelay ?? options?.maxTimeout ?? 30000;
    const factor = options?.factor ?? 2;
    const jitter = options?.jitter ?? false;
    const shouldRetry = options?.shouldRetry;
    const delayOverride = options?.delay;
    const onRetry = options?.onRetry;
    const timers = resolveTimers(options, deps);

    if (typeof jitter === 'number' && jitter < 0) {
      throw new RangeError('retry: jitter cannot be negative', { cause: jitter });
    }

    return constructTimed<T, K>(
      deps,
      (resolve, reject, ctx?: IExecutorCtx) => {
        const startedAt = readClock();
        let canceled = false;
        let backoffId: unknown;
        let currentAttempt: (PromiseLike<T> & { cancel?: (reason?: any) => void }) | undefined;

        if (ctx) {
          ctx.handleCancel(() => {
            canceled = true;
            if (backoffId !== undefined) stopTimer(backoffId, timers);
            if (currentAttempt && isCancelableLike(currentAttempt)) currentAttempt.cancel();
          });
        }

        const scheduleNext = (n: number, wait: number) => {
          backoffId = startTimer(
            () => {
              backoffId = undefined;
              attempt(n + 1);
            },
            wait,
            timers,
          );
        };

        const handleFailure = (n: number, reason: any) => {
          const retriesLeft = retries - n + 1;

          if (retriesLeft < 1) {
            reject(reason);
            return;
          }

          const ctxBase: IRetryContext = {
            attempt: n,
            retriesLeft,
            elapsed: readClock() - startedAt,
          };

          // nothing reads the chain this runs in, so an escaping throw would strand the retry
          // pending and surface as an unhandled rejection instead of a result
          try {
            const base = initialDelay * Math.pow(factor, n - 1);
            const capped = Math.min(maxDelay, base);
            const computedDelay = applyJitter(capped, jitter);

            let wait = computedDelay;

            if (delayOverride) {
              const overridden = delayOverride({ ...ctxBase, computedDelay });

              if (overridden !== undefined) wait = overridden;
            }

            const afterShouldRetry = (allow: boolean) => {
              if (canceled) return;

              if (!allow) {
                reject(reason);
                return;
              }

              try {
                onRetry?.(reason, n, wait);
                scheduleNext(n, wait);
              } catch (err) {
                if (err instanceof Error && err.cause === undefined) {
                  err.cause = reason;
                }
                reject(err);
              }
            };

            if (shouldRetry) {
              const result = shouldRetry(reason, ctxBase);

              if (isThenableLike(result)) {
                deps.Impl.resolve(result).then(
                  (allow: boolean) => afterShouldRetry(allow),
                  (err: any) => {
                    if (!canceled) {
                      if (err instanceof Error && err.cause === undefined) {
                        err.cause = reason;
                      }
                      reject(err);
                    }
                  },
                );
                return;
              }

              afterShouldRetry(result);
              return;
            }

            afterShouldRetry(true);
          } catch (err) {
            if (err instanceof Error && err.cause === undefined) {
              err.cause = reason;
            }
            reject(err);
          }
        };

        const attempt = (n: number) => {
          if (canceled) return;

          deps.Impl.resolve(undefined)
            .then(() => {
              if (canceled) return undefined as any;

              // Captured off the raw return of `input(n)`, not the wrapper chain, so canceling it
              // reaches the actual work directly rather than depending on adoption cascading a
              // cancel signal down through an intermediate link.
              const raw = input(n);

              if (isThenableLike<T>(raw)) {
                currentAttempt = raw as PromiseLike<T> & { cancel?: (reason?: any) => void };
                if (canceled && isCancelableLike(currentAttempt)) {
                  currentAttempt.cancel();
                }
              }

              return raw;
            })
            .then(
              (value: T) => {
                currentAttempt = undefined;
                if (!canceled) resolve(value);
              },
              (reason: any) => {
                currentAttempt = undefined;
                if (canceled) return;
                handleFailure(n, reason);
              },
            );
        };

        attempt(1);
      },
      options,
    );
  };
}
