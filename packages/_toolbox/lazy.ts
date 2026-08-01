import { construct, TExecutor, TExecutorCtx } from './construct';
import { IToolboxDeps } from './deps';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';

/** The one field this module reads off an options bag; every other key is opaque to it. */
interface ILazyOption {
  lazy?: boolean;
}

type TLazyState = 'UNSTARTED' | 'RUNNING' | 'SETTLED';

/**
 * Deferred-start wrapper behind `{ lazy: true }`. The real executor (the timer, the retry attempt,
 * the poll condition, the callback invocation...) does not run until the first
 * `then`/`catch`/`finally`/`await`, and the result is cached so a second subscriber reuses that one
 * execution instead of starting a new one.
 *
 * This is a small, self-contained analog of `_lazy/LazyBase`, reimplemented locally rather than
 * imported: `_lazy` type-imports `_util`, which type-imports `@cancjs/promise`, and the native
 * toolbox twin has to stay a zero-`@cancjs/promise`-dependency package (the same reason
 * `_toolbox/guards.ts` carries its own duck-type checks instead of importing `_util`'s). A later
 * phase folds this together with `_lazy` for real; until then this module only needs the subset
 * `delay`, `timeout`, `retry`, `waitFor` and `promisify` actually use.
 *
 * Laziness here is NOT contagious. `delay(1000, { lazy: true }).then(f)` starts the timer at the
 * `.then` call, it does not defer `f` past anything further. A cold, non-contagious CHAIN primitive
 * is a separate, later concern.
 */
class ToolboxLazy<T> implements PromiseLike<T> {
  private _state: TLazyState = 'UNSTARTED';
  private _inner?: PromiseLike<T> & { cancel?: (reason?: any) => void };
  private _canceledBeforeStart = false;
  private _cancelReason: unknown;
  private _canceledResult?: PromiseLike<T>;

  constructor(
    private readonly _Impl: IToolboxDeps<IPromiseLikeKind>['Impl'],
    private readonly _cancelable: boolean,
    private readonly _executor: TExecutor<T>,
    private readonly _options: object | undefined,
  ) {}

  private _start(): PromiseLike<T> {
    if (this._inner) {
      return this._inner;
    }

    this._state = 'RUNNING';

    const inner = construct<T>(this._Impl, this._executor, this._options) as PromiseLike<T> & {
      cancel?: (reason?: any) => void;
    };

    this._inner = inner;

    const markSettled = () => {
      this._state = 'SETTLED';
    };

    inner.then(markSettled, markSettled);

    return inner;
  }

  // No-op executor: the real work never runs, so whatever it would have scheduled (a timer, a
  // retry attempt, a poll) never gets scheduled either. A cancelable `Impl` turns `.cancel()` on
  // this inert instance into its OWN genuine cancel rejection (a branded CancelError for
  // CancelablePromise) through its own machinery, so this module never has to know what that error
  // type looks like. A non-cancelable `Impl` has no `cancel` to call, which is fine: `cancel()` on
  // this class is already a no-op in that case (see below), so this path is never reached for one.
  private _canceledInert(): PromiseLike<T> {
    if (!this._canceledResult) {
      const inert = construct<T>(
        this._Impl,
        (_resolve, _reject, ctx?: TExecutorCtx) => {
          ctx?.handleCancel(() => {});
        },
        this._options,
      ) as PromiseLike<T> & { cancel?: (reason?: any) => void };

      inert.cancel?.(this._cancelReason);
      this._canceledResult = inert;
    }

    return this._canceledResult;
  }

  then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const inner = this._canceledBeforeStart ? this._canceledInert() : this._start();

    return inner.then(onFulfilled, onRejected);
  }

  catch<TResult = never>(
    onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): PromiseLike<T | TResult> {
    return this.then(undefined, onRejected);
  }

  finally(onFinally?: (() => void) | null): PromiseLike<T> {
    return this.then(
      (value) => {
        onFinally?.();
        return value;
      },
      (reason) => {
        onFinally?.();
        throw reason;
      },
    );
  }

  /**
   * Cancel-before-start: the real executor never runs at all, so nothing it would have scheduled
   * ever gets scheduled. Cancel-after-start: delegates to the started instance's own `cancel`,
   * which is a no-op when `Impl` is not cancelable-shaped. A no-op when this lazy was built from a
   * non-cancelable `Impl` in the first place (nothing to cancel).
   */
  cancel(reason?: any): void {
    if (!this._cancelable) {
      return;
    }

    if (this._inner) {
      this._inner.cancel?.(reason);
      return;
    }

    if (this._state === 'UNSTARTED') {
      this._canceledBeforeStart = true;
      this._cancelReason = reason;
    }
  }
}

/**
 * Route a timed/control helper's construction through the deferred-start wrapper when
 * `options.lazy` is set, or through the normal eager `construct` otherwise. This is the single
 * branch point `delay`, `timeout`, `retry`, `waitFor` and `promisify` call instead of `construct`
 * directly, so `{ lazy: true }` support lives in one place rather than being reimplemented per
 * helper. `minDelay`, `defer`, `debounce` and `throttle` keep calling `construct` unchanged and do
 * not read `options.lazy`.
 */
export function constructTimed<T, K extends IPromiseKind = IPromiseLikeKind>(
  deps: IToolboxDeps<K>,
  executor: TExecutor<T>,
  options?: object,
): TPromiseOf<K, T> {
  if ((options as ILazyOption | undefined)?.lazy === true) {
    return new ToolboxLazy<T>(deps.Impl, deps.cancelable === true, executor, options) as unknown as TPromiseOf<K, T>;
  }

  return construct<T, K>(deps.Impl, executor, options);
}
