import { IAbortSignalOptions, withAbortSignal } from '../abort-signal';
import { IExecutorCtx, TPromiseCtor } from '../construct';
import { isFunction } from '../guards';
import { ILazyWithResolvers, LazyBase, TLazyExecutor } from './lazy-base';

export type { TLazyExecutor, TLazyOnCancel } from './lazy-base';

/**
 * The native lazy promise has no `cancel()`, so an `AbortSignal` is its only cancellation surface.
 * Abort before the first subscription means the executor never runs; abort while running rejects
 * with the signal's own `reason` (never a `CancelError` - this flavor has no cancellation
 * semantics of its own to fake) and runs any registered teardown. The underlying work itself is
 * never stopped, only the waiting for it.
 */
export type ILazyPromiseOptions = IAbortSignalOptions;

// Captured once at module load per the native-Promise capture invariant; never re-read the
// global afterward.
const NativePromise = Promise;

/**
 * A lazily-evaluated promise-like backed by the native `Promise`. The executor is deferred until
 * the first `then`/`catch`/`finally` (or `await`). The result is cached: multiple subscribers
 * share a single execution. There is no cancellation surface at all; the cancelable twin lives in
 * the cancelable toolbox.
 */
export class LazyPromise<T = any> extends LazyBase<T> {
  // Static surface mirrored from the cancelable twin, so the same code reads the same in both
  // toolboxes. The implementations are inherited; these declarations only narrow the flavor and
  // its options bag, and emit nothing.
  declare static try: <V, TArgs extends any[]>(
    fn: (...args: TArgs) => V | PromiseLike<V>,
    ...args: TArgs
  ) => LazyPromise<V>;
  declare static resolve: <V>(value?: V | PromiseLike<V>, options?: ILazyPromiseOptions) => LazyPromise<V>;
  declare static reject: <V = never>(reason?: any, options?: ILazyPromiseOptions) => LazyPromise<V>;
  declare static withResolvers: <V>(options?: ILazyPromiseOptions) => ILazyWithResolvers<V, LazyPromise<V>>;
  declare static all: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V[]>;
  declare static allSettled: <V>(
    values: Iterable<V | PromiseLike<V>>,
    options?: ILazyPromiseOptions,
  ) => LazyPromise<PromiseSettledResult<Awaited<V>>[]>;
  declare static any: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V>;
  declare static race: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V>;

  declare protected _options?: ILazyPromiseOptions;

  /**
   * With no signal, this is a pure passthrough to the native `Promise`, byte-identical to before
   * this option existed. With a signal, `_start()` calls `new Impl(executor)` with no second
   * argument (unlike every other toolbox helper, which forwards options through `construct()`), so
   * the signal has to be bound here via closure instead of relying on it being forwarded.
   *
   * `ctx.handleCancel` from the shared wrapper is threaded to a callback of our own, ahead of the
   * lazy's own executor, so `this._teardowns` (populated by `_start()` from the executor's RETURN
   * value regardless of a signal being present) also runs on abort - the same two-teardown-forms
   * coverage the cancelable flavor's `cancel()` gives, just triggered by the signal instead.
   */
  protected _resolveImpl(): TPromiseCtor {
    const options = this._options;

    if (!options?.signal) {
      return NativePromise as unknown as TPromiseCtor;
    }

    const AbortAwareCtor = withAbortSignal(NativePromise as unknown as TPromiseCtor);
    const runTeardowns = this._runTeardowns.bind(this);

    type TInnerExecutor = (resolve: (value: any) => void, reject: (reason?: any) => void, ctx?: IExecutorCtx) => void;

    function AbortAwareLazyCtor(executor: TInnerExecutor): PromiseLike<any> {
      return new (AbortAwareCtor as unknown as new (executor: TInnerExecutor, options?: object) => PromiseLike<any>)(
        (resolve, reject, ctx) => {
          if (ctx) {
            ctx.handleCancel((reason?: unknown) => runTeardowns(reason));
          }

          executor(resolve, reject, ctx);
        },
        options,
      );
    }

    (AbortAwareLazyCtor as unknown as { resolve: TPromiseCtor['resolve'] }).resolve = (
      AbortAwareCtor as unknown as { resolve: TPromiseCtor['resolve'] }
    ).resolve;

    return AbortAwareLazyCtor as unknown as TPromiseCtor;
  }
}

/**
 * Create a lazy promise from an executor. The executor does not run until the returned value is
 * first subscribed (`then`/`catch`/`finally`/`await`).
 */
export function lazy<T = any>(executor: TLazyExecutor<T>, options?: ILazyPromiseOptions): LazyPromise<T> {
  return new LazyPromise<T>(executor, options);
}

/**
 * Create a lazy promise from whatever you have. A function is called on the first subscription, a
 * lazy promise of this flavor is handed back unchanged so its laziness survives, a plain promise
 * keeps running but the subscription to it is deferred, and any other value is resolved lazily.
 *
 * Reach for `LazyPromise.try` when you know you have a function. Reach for this when the input's
 * shape varies, which is the library and adapter case.
 */
export function createLazyPromise<T = any>(
  value: T | PromiseLike<T> | (() => T | PromiseLike<T>),
  options?: ILazyPromiseOptions,
): LazyPromise<T> {
  // Built directly rather than through `try`, which has no options slot by design.
  if (isFunction(value)) {
    return new LazyPromise<T>((resolve, reject) => {
      try {
        resolve(value() as T | PromiseLike<T>);
      } catch (error) {
        reject(error);
      }
    }, options);
  }

  return LazyPromise.resolve<T>(value, options);
}
