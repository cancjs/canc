import { TPromiseCtor } from '../construct';
import { isCancelableLike, isFunction } from '../guards';

/**
 * A cleanup callback registered by the executor, run when the lazy is torn down. Supplied to the
 * executor as its third argument only by a cancelable-shaped implementation; a plain native Promise
 * calls the executor with two arguments.
 */
export type TLazyOnCancel = (reason?: any) => void;

/**
 * Executor for a lazy promise. Runs on the first subscription, never before. Besides the standard
 * `resolve`/`reject`, it receives `handleCancel` to register cleanup, and may also RETURN a
 * teardown function. Both forms register cleanup; a non-function return value is ignored.
 */
export type TLazyExecutor<T> = (
  resolve: (value?: T | PromiseLike<T>) => void,
  reject: (reason?: any) => void,
  handleCancel: (onCancel: TLazyOnCancel) => void,
) => void | TLazyOnCancel;

export type TLazyState = 'UNSTARTED' | 'RUNNING' | 'SETTLED';

/** The product of a promise implementation, as much of it as a lazy needs to see. */
export type TInnerPromise<T> = PromiseLike<T> & { cancel?: (reason?: any) => any };

/**
 * The static surface a lazy combinator delegates to. Spelled out here rather than borrowed from
 * `PromiseConstructor` so this module needs no particular `lib` setting. Combinator semantics come
 * entirely from the injected implementation, which is why `race` cancels losers on the cancelable
 * flavor and cannot on the native one.
 */
export interface ILazyImplStatics {
  all(values: any): PromiseLike<any>;
  allSettled(values: any): PromiseLike<any>;
  any(values: any): PromiseLike<any>;
  race(values: any): PromiseLike<any>;
  reject(reason?: any): PromiseLike<any>;
}

/**
 * What `withResolvers` hands back. The cancelable flavor widens `promise` and adds `cancel`; the
 * native flavor has no cancellation surface, so it hands back nothing for it.
 */
export interface ILazyWithResolvers<T, TPromise extends PromiseLike<T> = LazyBase<T>> {
  promise: TPromise;
  resolve: (value?: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

// One settlement handed to a `withResolvers` settler, held until the executor can replay it.
interface ILazySettlement {
  fulfilled: boolean;
  value: any;
}

/**
 * Brand every lazy promise carries on its prototype. A `Symbol.for` entry is the same symbol across
 * realms and across inlined copies of this module, so detection by it survives both, which
 * `instanceof` does not.
 */
export const LAZY_PROMISE_BRAND = Symbol.for('@cancjs/toolbox:LazyPromise');

/**
 * Lazily-evaluated promise-like state machine, free of any cancellation semantics. The executor is
 * deferred until the first `then`/`catch`/`finally` (or `await`), and the result is cached so
 * multiple subscribers share a single execution. Subclasses provide the underlying promise
 * implementation via {@link _resolveImpl} and layer on cancellation (see the cancelable flavor).
 */
export abstract class LazyBase<T = any> implements PromiseLike<T> {
  // Build through `new this(...)`, so a static called on a flavor produces that flavor. The cast
  // covers only the base being abstract; at runtime `this` is always a concrete flavor.
  protected static _new<V>(executor: TLazyExecutor<V>, options?: object): LazyBase<V> {
    const Ctor = this as unknown as new (executor: TLazyExecutor<V>, options?: object) => LazyBase<V>;

    return new Ctor(executor, options);
  }

  // Whether the requested options differ from the ones an existing instance already carries, which
  // is what decides between reusing it and building a reconfigured copy.
  protected static _optionsChanged(instance: LazyBase<any>, options?: object): boolean {
    if (!options) {
      return false;
    }

    const current = (instance._options || {}) as Record<string, unknown>;
    const requested = options as Record<string, unknown>;

    return Object.keys(requested).some((key) => current[key] !== requested[key]);
  }

  /**
   * Invoke `fn` with `args` on the first subscription, never before, wrapping its return value and
   * any synchronous throw into the lazy's settlement. Canceling before the first subscription means
   * `fn` never runs at all.
   *
   * Takes no options bag: the rest arguments occupy that slot, matching `CancelablePromise.try`.
   * Use `createLazyPromise` when options are needed or when the input's shape varies.
   */
  static try<V, TArgs extends any[]>(fn: (...args: TArgs) => V | PromiseLike<V>, ...args: TArgs): LazyBase<V> {
    return this._new<V>((resolve, reject) => {
      try {
        resolve(fn(...args));
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * A lazy promise for the given value. A lazy of this same flavor with unchanged options is
   * returned as is, which is what keeps its laziness intact instead of burying it in a second
   * object whose cancel could not reach it. Anything else is wrapped, and the subscription to it is
   * deferred to the first subscription of the result.
   */
  static resolve<V>(value?: V | PromiseLike<V>, options?: object): LazyBase<V> {
    if (value instanceof this && value.constructor === this && !this._optionsChanged(value, options)) {
      return value as LazyBase<V>;
    }

    return this._new<V>((resolve) => resolve(value), options);
  }

  /**
   * A lazy promise rejected with the given reason. The rejection is not created until someone
   * subscribes, so an unconsumed one cannot raise an unhandled rejection the way an eager rejected
   * promise can.
   */
  static reject<V = never>(reason?: any, options?: object): LazyBase<V> {
    return this._new<V>((_resolve, reject) => reject(reason), options);
  }

  /**
   * A lazy promise plus its settlers. The holder may settle it whenever they like, but the EFFECT
   * is deferred: a settlement made before the first subscription is recorded and replayed when the
   * executor eventually runs, so resolving with another lazy promise does not start it, and
   * rejecting cannot raise an unhandled rejection, until someone subscribes.
   *
   * Settle-once holds across that boundary, and canceling before the first subscription wins over a
   * recorded settlement (the executor never runs, so a recorded lazy value never starts). The record
   * survives a reset on a resettable lazy: an external settlement is a fact to replay, not work to
   * redo, so a later subscription sees the same settlement again.
   */
  static withResolvers<V>(options?: object): ILazyWithResolvers<V> {
    let settlement: ILazySettlement | undefined;
    let live: { resolve: (value?: any) => void; reject: (reason?: any) => void } | undefined;

    const replay = () => {
      if (!live || !settlement) {
        return;
      }

      if (settlement.fulfilled) {
        live.resolve(settlement.value);
      } else {
        live.reject(settlement.value);
      }
    };

    const promise = this._new<V>((resolve, reject) => {
      live = { resolve, reject };
      replay();
    }, options);

    const settle = (fulfilled: boolean, value: any) => {
      if (settlement) {
        return;
      }

      settlement = { fulfilled, value };
      replay();
    };

    const resolvers: ILazyWithResolvers<V> = {
      promise,
      resolve: (value?: V | PromiseLike<V>) => settle(true, value),
      reject: (reason?: any) => settle(false, reason),
    };

    // Handed out only by a flavor that has one, so the native twin gets no inert stub.
    if (isCancelableLike(promise)) {
      (resolvers as ILazyWithResolvers<V> & { cancel: TLazyOnCancel }).cancel = (reason?: any) =>
        promise.cancel(reason);
    }

    return resolvers;
  }

  /**
   * A lazy promise for the implementation's `all`. Cold all the way down: the aggregate is not
   * built until the result is subscribed, so nested lazy promises are not started until then.
   */
  static all<V>(values: Iterable<V | PromiseLike<V>>, options?: object): LazyBase<V[]> {
    // The aggregate refers to itself so the implementation is resolved at start time, the same
    // per-call precedence a subscription gets. The executor cannot run before the assignment.
    const aggregate: LazyBase<V[]> = this._new<V[]>(
      (resolve) => resolve(aggregate._resolveImplStatics().all(values) as PromiseLike<V[]>),
      options,
    );

    return aggregate;
  }

  /** A lazy promise for the implementation's `allSettled`. Cold until subscribed, like `all`. */
  static allSettled<V>(
    values: Iterable<V | PromiseLike<V>>,
    options?: object,
  ): LazyBase<PromiseSettledResult<Awaited<V>>[]> {
    const aggregate: LazyBase<PromiseSettledResult<Awaited<V>>[]> = this._new<PromiseSettledResult<Awaited<V>>[]>(
      (resolve) =>
        resolve(aggregate._resolveImplStatics().allSettled(values) as PromiseLike<PromiseSettledResult<Awaited<V>>[]>),
      options,
    );

    return aggregate;
  }

  /** A lazy promise for the implementation's `any`. Cold until subscribed, like `all`. */
  static any<V>(values: Iterable<V | PromiseLike<V>>, options?: object): LazyBase<V> {
    const aggregate: LazyBase<V> = this._new<V>(
      (resolve) => resolve(aggregate._resolveImplStatics().any(values) as PromiseLike<V>),
      options,
    );

    return aggregate;
  }

  /**
   * A lazy promise for the implementation's `race`. Cold until subscribed, like `all`, and the
   * loser handling is the implementation's: the cancelable flavor cancels them, the native one
   * cannot.
   */
  static race<V>(values: Iterable<V | PromiseLike<V>>, options?: object): LazyBase<V> {
    const aggregate: LazyBase<V> = this._new<V>(
      (resolve) => resolve(aggregate._resolveImplStatics().race(values) as PromiseLike<V>),
      options,
    );

    return aggregate;
  }

  declare readonly [LAZY_PROMISE_BRAND]: true;

  protected _executor: TLazyExecutor<T>;
  protected _options?: object;
  protected _state: TLazyState = 'UNSTARTED';
  protected _inner?: TInnerPromise<T>;
  protected _teardowns: TLazyOnCancel[] = [];

  constructor(executor: TLazyExecutor<T>, options?: object) {
    if (!isFunction(executor)) {
      throw new TypeError('Argument is not a function');
    }

    this._executor = executor;
    this._options = options;
  }

  /** Subclass hook: the promise implementation the inner promise is built from. */
  protected abstract _resolveImpl(): TPromiseCtor;

  // The same implementation seen through its static surface, which is what the combinators and the
  // cancel-before-start short circuit delegate to.
  protected _resolveImplStatics(): ILazyImplStatics {
    return this._resolveImpl() as unknown as ILazyImplStatics;
  }

  // Builds and runs the underlying promise once, wiring the executor's handleCancel arg and its
  // optional teardown return into a single teardown list. Idempotent per lifecycle: once RUNNING or
  // SETTLED it returns the cached inner.
  protected _start(): PromiseLike<T> {
    if (this._inner) {
      return this._inner;
    }

    this._state = 'RUNNING';

    const Impl = this._resolveImpl();
    const handleCancel = (onCancel: TLazyOnCancel) => {
      if (isFunction(onCancel)) {
        this._teardowns.push(onCancel);
      }
    };

    // Cancelable-family impls carry the three-arg executor with a ctx object. A plain
    // PromiseConstructor (native twin, injected Promise) ignores the third arg, so teardown wiring
    // falls back to the executor's return value only.
    const inner = new Impl((resolve: (value?: any) => void, reject: (reason?: any) => void, ctx) => {
      const returned = this._executor(
        resolve as (value?: T | PromiseLike<T>) => void,
        reject,
        ctx ? ctx.handleCancel : handleCancel,
      );

      if (isFunction(returned)) {
        this._teardowns.push(returned);
      }
    }) as TInnerPromise<T>;

    this._inner = inner;

    const markSettled = () => {
      this._state = 'SETTLED';
    };
    // Cache-settle marker. Await-safe: adopting the inner via then keeps A+ microtask ordering.
    inner.then(markSettled, markSettled);

    return inner;
  }

  protected _runTeardowns(reason?: any): void {
    const teardowns = this._teardowns;
    this._teardowns = [];

    for (const teardown of teardowns) {
      teardown(reason);
    }
  }

  then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const shortCircuit = this._beforeSubscribe();

    if (shortCircuit) {
      return shortCircuit.then(onFulfilled, onRejected);
    }

    const inner = this._start();
    this._afterSubscribe();

    return inner.then(onFulfilled, onRejected);
  }

  // Subclass hook run at the top of every `then`, before starting. Returning a PromiseLike
  // short-circuits the subscription entirely (e.g. a cancel-before-start rejection); returning
  // undefined proceeds to `_start`. Base never short-circuits.
  protected _beforeSubscribe(): PromiseLike<T> | undefined {
    return undefined;
  }

  // Subclass hook run after `_start` on a live subscription (e.g. consumer counting). Base no-op.
  protected _afterSubscribe(): void {}

  // Subclass hook: whether the executor may still be started. A flavor that can be canceled before
  // it starts reports false once that has happened, so `execute()` stays a no-op rather than
  // building a rejection nobody subscribed to.
  protected _isStartable(): boolean {
    return true;
  }

  /**
   * Start the work now, without subscribing to the result. Prefetch first, await later.
   *
   * This is not sugar for `void lazy.then()`. That spelling builds a derived promise with no
   * handlers, so a rejection surfaces as an unhandled rejection even when the lazy itself is
   * awaited somewhere else, which is exactly the prefetch-then-await case. Starting directly
   * creates no derived promise, so prefetching cannot manufacture that false positive.
   *
   * Idempotent: calling it again, or after the work has settled, does nothing. On a lazy that was
   * canceled before it started it is a no-op and the executor still never runs.
   */
  execute(): void {
    if (!this._isStartable()) {
      return;
    }

    this._start();
  }

  catch<TResult = never>(
    onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
  ): PromiseLike<T | TResult> {
    return this.then(null, onRejected);
  }

  finally(onFinally?: (() => void) | null): PromiseLike<T> {
    return this.then(
      (value) => {
        if (isFunction(onFinally)) onFinally();
        return value;
      },
      (reason) => {
        if (isFunction(onFinally)) onFinally();
        throw reason;
      },
    );
  }

  /** True once the executor has been triggered by a subscription. */
  get started(): boolean {
    return this._state !== 'UNSTARTED';
  }
}

// Set on the prototype, so no instance carries it as an own property and every flavor built on this
// base is recognized by the single guard below.
Object.defineProperty(LazyBase.prototype, LAZY_PROMISE_BRAND, {
  configurable: false,
  enumerable: false,
  writable: false,
  value: true,
});

/**
 * Whether a value is a lazy promise from either toolbox. Brand only, with no `name` fallback: this
 * is our own type rather than a platform one, so nothing outside these packages can legitimately
 * claim it.
 */
export function isLazyPromise<T = any>(value: unknown): value is LazyBase<T> {
  return (
    !!value &&
    (typeof value === 'object' || typeof value === 'function') &&
    (value as Record<PropertyKey, unknown>)[LAZY_PROMISE_BRAND] === true
  );
}
