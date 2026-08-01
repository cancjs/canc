import { CancelError, ICancelablePromiseOptions, IPromiseImplOptions, resolvePromiseImpl } from '@cancjs/promise';

import { TPromiseCtor } from '../construct';
import { isFunction } from '../guards';
import { ILazyWithResolvers, LazyBase, TLazyExecutor, TLazyOnCancel } from './lazy-base';

export type { TLazyExecutor, TLazyOnCancel } from './lazy-base';

/** What the cancelable flavor's `withResolvers` hands back: the settlers plus a cancel. */
export interface ICancelableLazyWithResolvers<T> extends ILazyWithResolvers<T, LazyPromise<T>> {
  cancel: TLazyOnCancel;
}

export interface ILazyPromiseOptions extends ICancelablePromiseOptions, IPromiseImplOptions {
  /**
   * When true, if every consumer cancels before the lazy promise settles, its teardown runs and it
   * returns to the unstarted state, so a later `then`/`await` re-runs the executor from scratch.
   * Default false: a lazy promise executes at most once and caches its settlement (a canceled lazy
   * stays canceled).
   */
  resettable?: boolean;
}

/**
 * A lazily-evaluated, cancelable promise-like. The executor is deferred until the first
 * `then`/`catch`/`finally` (or `await`). Canceling before the first subscription means the executor
 * never runs at all. The result is cached: multiple subscribers share a single execution.
 *
 * This is not a CancelablePromise subclass. It is a bare thenable carrying a `cancel`, which is
 * what every duck-typed cancelability check in this repo already accepts.
 */
export class LazyPromise<T = any> extends LazyBase<T> {
  // Static surface mirrored from CancelablePromise. The implementations are inherited; these
  // declarations only narrow the flavor and its options bag, and emit nothing.
  declare static try: <V, TArgs extends any[]>(
    fn: (...args: TArgs) => V | PromiseLike<V>,
    ...args: TArgs
  ) => LazyPromise<V>;
  declare static resolve: <V>(value?: V | PromiseLike<V>, options?: ILazyPromiseOptions) => LazyPromise<V>;
  declare static reject: <V = never>(reason?: any, options?: ILazyPromiseOptions) => LazyPromise<V>;
  declare static withResolvers: <V>(options?: ILazyPromiseOptions) => ICancelableLazyWithResolvers<V>;
  declare static all: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V[]>;
  declare static allSettled: <V>(
    values: Iterable<V | PromiseLike<V>>,
    options?: ILazyPromiseOptions,
  ) => LazyPromise<PromiseSettledResult<Awaited<V>>[]>;
  declare static any: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V>;
  declare static race: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V>;

  declare protected _options?: ILazyPromiseOptions;
  protected _canceledBeforeStart = false;
  protected _cancelError?: CancelError;
  protected _resettable: boolean;
  // Live-consumer tally, only meaningful for a resettable lazy. Each `then` that subscribes before
  // settlement increments it; a per-consumer cancel decrements it. Reaching zero before settlement
  // triggers teardown + reset.
  protected _consumers = 0;

  constructor(executor: TLazyExecutor<T>, options?: ILazyPromiseOptions) {
    super(executor, options);

    this._resettable = !!options?.resettable;
  }

  /**
   * Precedence, highest first: a per-call `options.impl`, then the app-wide registry, then the
   * built-in CancelablePromise. There is deliberately no per-class static override: this module is
   * inlined into every consuming package, so a mutable static would be a separate slot per copy
   * rather than one app-wide setting. The registry lives in the published promise package, which a
   * package manager dedupes to a single instance, and is the supported app-wide layer.
   */
  protected _resolveImpl(): TPromiseCtor {
    return resolvePromiseImpl(this._options, undefined) as unknown as TPromiseCtor;
  }

  // Cancel-before-start: executor never ran; short-circuit to a rejected settlement so `await`
  // and `.catch` observe the CancelError without ever touching the executor.
  protected _beforeSubscribe(): PromiseLike<T> | undefined {
    if (this._canceledBeforeStart) {
      return this._resolveImplStatics().reject(this._cancelError) as PromiseLike<T>;
    }

    return undefined;
  }

  protected _isStartable(): boolean {
    return !this._canceledBeforeStart;
  }

  protected _afterSubscribe(): void {
    if (this._resettable && this._state === 'RUNNING') {
      this._consumers++;
    }
  }

  /**
   * Cancel the lazy promise. Before the first subscription this skips the executor entirely (it
   * never runs). While running it cancels the underlying promise and runs any registered teardown.
   * On a resettable lazy this is a full per-consumer cancel and, once the last consumer is gone,
   * resets to the unstarted state.
   */
  cancel(reason?: any): void {
    if (this._state === 'SETTLED') {
      return;
    }

    if (this._state === 'UNSTARTED') {
      this._canceledBeforeStart = true;
      this._cancelError = reason instanceof CancelError ? reason : new CancelError(reason);
      this._runTeardowns(reason);
      return;
    }

    // RUNNING
    if (this._resettable && this._consumers > 0) {
      this._consumers--;

      if (this._consumers > 0) {
        // Other live consumers still want the result; keep executing.
        return;
      }
    }

    const inner = this._inner;
    this._runTeardowns(reason);

    if (inner && typeof inner.cancel === 'function') {
      inner.cancel(reason);
    }

    if (this._resettable) {
      this._reset();
    }
  }

  // Return to UNSTARTED so a later subscription re-runs the executor from scratch (resettable only).
  protected _reset(): void {
    this._state = 'UNSTARTED';
    this._inner = undefined;
    this._teardowns = [];
    this._consumers = 0;
    this._canceledBeforeStart = false;
    this._cancelError = undefined;
  }
}

/**
 * Create a lazy, cancelable promise from an executor. The executor does not run until the returned
 * value is first subscribed (`then`/`catch`/`finally`/`await`).
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
