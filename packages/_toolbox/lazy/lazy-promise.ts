import type { FailureOf, ICancelablePromiseOptions, IPromiseImplOptions, TReason } from '@cancjs/promise';
import { CancelError, FAILURE, resolvePromiseImpl } from '@cancjs/promise';

import { toCancelError } from '../../_util';
import { IAbortSignalLike } from '../abort-signal';
import { TPromiseCtor } from '../construct';
import { isFunction, isThenableLike } from '../guards';
import { ISettledResult } from '../settled-result';
import { ILazyWithResolvers, LazyBase, TInnerPromise, TLazyExecutor, TLazyOnCancel } from './lazy-base';

export type { TLazyExecutor, TLazyOnCancel } from './lazy-base';

/** What the cancelable flavor's `withResolvers` hands back: the settlers plus a cancel. */
export interface ICancelableLazyWithResolvers<T> extends ILazyWithResolvers<T, LazyPromise<T>> {
  cancel: TLazyOnCancel;
}

export interface ILazyPromiseOptions extends ICancelablePromiseOptions, IPromiseImplOptions {
  /**
   * When true, a cancel before the lazy promise settles runs its teardown and returns it to the
   * unstarted state, so a later `then`/`await` re-runs the executor from scratch. A consumer leaves
   * by canceling the promise its own `then` returned; once every consumer has left, the lazy
   * promise is canceled the same way.
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
 * `F` is the failure set, read the same way as on a CancelablePromise: a rejection handler receives
 * `any` unless the set is declared and closed.
 *
 * This is not a CancelablePromise subclass. It is a bare thenable carrying a `cancel`, which is
 * what every duck-typed cancelability check in this repo already accepts.
 */
export class LazyPromise<T = any, F = unknown> extends LazyBase<T> {
  // Static surface mirrored from CancelablePromise where inherited implementations are narrowed
  // by these declarations to the flavor and options bag without emitting anything
  declare static try: <V, TArgs extends any[]>(
    fn: (...args: TArgs) => V,
    ...args: TArgs
  ) => LazyPromise<Awaited<V>, FailureOf<V>>;
  declare static resolve: <V>(value?: V | PromiseLike<V>, options?: ILazyPromiseOptions) => LazyPromise<V>;
  declare static reject: <V = never>(reason?: any, options?: ILazyPromiseOptions) => LazyPromise<V>;
  declare static fail: <TError>(
    error: TError,
    options?: ILazyPromiseOptions,
  ) => LazyPromise<never, Exclude<TError, CancelError>>;
  declare static withResolvers: <V>(options?: ILazyPromiseOptions) => ICancelableLazyWithResolvers<V>;
  declare static all: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V[]>;
  declare static allSettled: <V>(
    values: Iterable<V | PromiseLike<V>>,
    options?: ILazyPromiseOptions,
  ) => LazyPromise<ISettledResult<Awaited<V>>[]>;
  declare static any: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V>;
  declare static race: <V>(values: Iterable<V | PromiseLike<V>>, options?: ILazyPromiseOptions) => LazyPromise<V>;

  declare readonly [FAILURE]?: F;
  declare protected _options?: ILazyPromiseOptions;
  protected _canceledBeforeStart = false;
  protected _cancelError?: CancelError;
  protected _resettable: boolean;
  // consumers of the current run of a resettable lazy that have not left yet
  protected _consumers = 0;
  protected _unwatchSignals?: () => void;
  // a cancel called by the executor itself, applied once the work promise exists
  protected _pendingCancel?: { reason: any };

  constructor(executor: TLazyExecutor<T>, options?: ILazyPromiseOptions) {
    super(executor, options);

    this._resettable = !!options?.resettable;
    this._watchSignals();
  }

  // Until the work starts nothing else observes the signal, an abort then is a cancel before start
  protected _watchSignals(): void {
    const signal = this._options?.signal as IAbortSignalLike | IAbortSignalLike[] | undefined;

    if (!signal) {
      return;
    }

    const signals = Array.isArray(signal) ? signal : [signal];
    const preAborted = signals.find((each) => each.aborted);

    if (preAborted) {
      this.cancel(preAborted.reason);
      return;
    }

    const listeners = signals.map((each) => {
      const listener = () => {
        void this.cancel(each.reason);
      };
      each.addEventListener('abort', listener, { once: true });
      return listener;
    });

    this._unwatchSignals = () => {
      this._unwatchSignals = undefined;
      signals.forEach((each, index) => each.removeEventListener('abort', listeners[index]));
    };
  }

  // The work promise carries the signal from here on
  protected _start(): PromiseLike<T> {
    if (this._unwatchSignals) {
      this._unwatchSignals();
    }

    const inner = super._start();
    const pending = this._pendingCancel;

    if (pending) {
      this._pendingCancel = undefined;
      void this.cancel(pending.reason);
    }

    return inner;
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

  protected _handleCancel(onCancel: TLazyOnCancel): void {
    if (this._canceledBeforeStart) {
      onCancel(this._cancelError);
      return;
    }

    super._handleCancel(onCancel);
  }

  then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: TReason<F>) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const derived = super.then(onFulfilled, onRejected);

    if (this._resettable) {
      this._trackConsumer(derived);
    }

    return derived;
  }

  // last derived promise canceled cancels the lazy
  protected _trackConsumer(derived: PromiseLike<unknown>): void {
    const inner = this._inner;
    const handleCancel = (derived as { handleCancel?: (onCancel: TLazyOnCancel) => unknown }).handleCancel;

    if (this._state !== 'RUNNING' || !inner || !isFunction(handleCancel)) {
      return;
    }

    this._consumers++;
    handleCancel.call(derived, (reason?: any) => {
      if (this._inner !== inner || this._state !== 'RUNNING') {
        return;
      }

      this._consumers--;

      if (this._consumers === 0) {
        void this.cancel(reason);
      }
    });
  }

  catch<TResult = never>(
    onRejected?: ((reason: TReason<F>) => TResult | PromiseLike<TResult>) | null,
  ): PromiseLike<T | TResult> {
    return super.catch(onRejected);
  }

  /**
   * Cancel the lazy promise. Before the first subscription this skips the executor entirely (it
   * never runs). While running it runs any registered teardown and cancels the underlying promise,
   * and a resettable lazy returns to the unstarted state. A cancel called by the executor itself
   * takes effect as soon as the executor returns.
   *
   * Every teardown runs even when one throws. When the underlying promise has an awaitable cancel,
   * the returned promise resolves with its cleanup results, preceded by one result per teardown, so
   * a throwing teardown shows up there as a rejected entry. Otherwise the first teardown error is
   * rethrown once the underlying promise is canceled.
   */
  cancel(reason?: any): void | PromiseLike<ISettledResult<unknown>[]> {
    if (this._state === 'SETTLED') {
      return;
    }

    if (this._state === 'UNSTARTED') {
      this._canceledBeforeStart = true;
      this._cancelError = toCancelError(reason, CancelError);
      this._runTeardowns(reason);

      if (this._unwatchSignals) {
        this._unwatchSignals();
      }

      return;
    }

    const inner = this._inner as (TInnerPromise<T> & { shield?: boolean }) | undefined;

    if (!inner) {
      this._pendingCancel = { reason };
      return;
    }

    // a shielded work promise decides alone, strict throws there and nothing is torn down
    if (inner.shield) {
      if (isFunction(inner.cancel)) {
        inner.cancel(reason);
      }

      return;
    }

    const teardowns = this._teardowns;
    this._teardowns = [];

    // reset first so leaving consumers see a run already gone
    if (this._resettable) {
      this._reset();
    }

    const statics = this._resolveImplStatics();
    let failed = false;
    let firstError: unknown;
    const outcomes = teardowns.map((teardown): unknown => {
      try {
        return teardown(reason);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }

        return statics.reject(error);
      }
    });
    const cleanup: unknown = isFunction(inner.cancel) ? inner.cancel(reason) : undefined;

    if (isThenableLike<ISettledResult<unknown>[]>(cleanup)) {
      return cleanup.then((results) =>
        statics.allSettled(outcomes).then((own: ISettledResult<unknown>[]) => own.concat(results)),
      );
    }

    // no awaitable cancel to carry the error, thrown like a throwing cancel handler's
    outcomes.forEach((outcome) => {
      if (isThenableLike(outcome)) {
        outcome.then(undefined, () => undefined);
      }
    });

    if (failed) {
      throw firstError;
    }
  }

  // Return to UNSTARTED so a later subscription re-runs the executor from scratch
  protected _reset(): void {
    this._state = 'UNSTARTED';
    this._inner = undefined;
    this._run = undefined;
    this._pendingCancel = undefined;
    this._teardowns = [];
    this._consumers = 0;
    this._canceledBeforeStart = false;
    this._cancelError = undefined;
    this._watchSignals();
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
