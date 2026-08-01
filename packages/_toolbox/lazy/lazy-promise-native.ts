import { TPromiseCtor } from '../construct';
import { isFunction } from '../guards';
import { ILazyWithResolvers, LazyBase, TLazyExecutor } from './lazy-base';

export type { TLazyExecutor, TLazyOnCancel } from './lazy-base';

/**
 * Reserved for parity with the cancelable flavor's options bag. The native lazy promise takes no
 * options today; this type exists so call sites can be written generically across both toolboxes.
 */
export type ILazyPromiseOptions = Record<string, never>;

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

  protected _resolveImpl(): TPromiseCtor {
    return NativePromise as unknown as TPromiseCtor;
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
