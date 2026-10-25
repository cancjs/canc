import type { TAnyFn, Unlisted } from '../../_util';
import { AggregateError, createAggregateError, isFunction, isObject, isThenable } from '../../_util';
import type { MatchedOf, TErrorMatcher } from '../../_util/error-matchers';
import { CancelError } from './cancel-error';
import { thenSkipsChildExecutor, thenWithOwnChild } from './engine';
import { isCancelError, isCancPromise } from './helpers';

/**
 * App-wide brand: same rationale as CANCEL_ERROR_BRAND in cancel-error.ts. A Symbol.for
 * registry entry is identical across realms and across duplicated package copies, so duck-typing
 * via this brand (isCancPromise) is collision-proof and works across dual-package-hazard copies,
 * unlike `instanceof CancelablePromise`.
 */
export const CANCEL_PROMISE_BRAND = Symbol.for('@cancjs/promise:CancelablePromise');

/**
 * Phantom key. Never assigned at runtime; it exists so the declared failure set is part of the
 * type.
 * A second declaration of this symbol anywhere would be a different type even though the
 * runtime symbol is the same, so this is the only one.
 */
export const FAILURE: unique symbol = Symbol.for('@cancjs/promise:failure') as symbol as typeof FAILURE;

// cancellation is a separate outcome, never part of the declared set
export interface Failing<TFailure> {
  readonly [FAILURE]?: Exclude<TFailure, CancelError>;
}

// a plain value has a result but declares no failure, hence the never fallback
// a native or foreign thenable may reject with anything, so it reads as open
// `any` declares nothing, so a handler returning `any` keeps the chain's own set
export type FailureOf<T> =
  0 extends 1 & T ? never
  : T extends { readonly [FAILURE]?: infer F } ?
    [F] extends [undefined] ?
      never
    : F
  : T extends PromiseLike<unknown> ? Unlisted
  : never;

/** The value a canc promise resolves to. Pairs with {@link FailureOf}; the two mirror the
 * `CancelablePromise<TResult, TFailure>` parameters. See the comment above FailureOf for why the
 * two utilities fall back differently on a non-promise input. */
export type ResultOf<T> = Awaited<T>;

/**
 * The same promise, declaring `TFailure` in addition to whatever it already declares. Useful as an
 * annotation because it names the promise type instead of restating it. Narrowing an
 * already-declared set does not compile; to replace rather than add, compose the extractors
 * directly: `CancelablePromise<ResultOf<P>, TFailure>`.
 *
 * Applied to a subclass of CancelablePromise this yields CancelablePromise, because a conditional
 * type cannot reconstruct an arbitrary subclass with different type arguments.
 */
export type WithFailure<TPromise extends CancelablePromise<any, any>, TFailure> = CancelablePromise<
  ResultOf<TPromise>,
  FailureOf<TPromise> | TFailure
>;

/**
 * Declares what a promise rejects with, replacing whatever it declared before.
 *
 * This ASSERTS and verifies nothing at runtime; it exists for the direction {@link WithFailure}
 * refuses: narrowing or replacing an already-declared set. Where the change is only ADDING a
 * failure, prefer the checked annotation, which needs no call at all:
 *
 * ```ts
 * const declared: WithFailure<typeof promise, HttpError> = promise;
 * ```
 *
 * The failure is named in the first call and the promise is passed in the second, so the value type
 * is inferred from the promise instead of being restated. That also makes the first call reusable:
 *
 * ```ts
 * const withHttpFailure = withFailure<HttpError>();
 * const user = withHttpFailure(loadUser(id));
 * ```
 *
 * The first call takes up to four failure types, `withFailure<HttpError, NotFoundError>()`; name a
 * union for more. It also takes error matchers, `withFailure(HttpError, NotFoundError)` or a guard
 * made by `createIsError`, and then declares the type those matchers match. The matchers are not
 * evaluated at runtime. A plain boolean predicate declares `Error`, so use a type guard.
 *
 * Cancellation is never part of a declared set, so a `CancelError` among the arguments is dropped.
 */
export function withFailure<TFirst, TSecond = never, TThird = never, TFourth = never>(): <TResult>(
  promise: CancelablePromise<TResult, any>,
) => CancelablePromise<TResult, Exclude<TFirst | TSecond | TThird | TFourth, CancelError>>;
export function withFailure<TMatchers extends readonly [TErrorMatcher, ...TErrorMatcher[]]>(
  ...matchers: TMatchers
): <TResult>(
  promise: CancelablePromise<TResult, any>,
) => CancelablePromise<TResult, Exclude<MatchedOf<TMatchers>, CancelError>>;
export function withFailure() {
  return function <TResult>(promise: CancelablePromise<TResult, any>): CancelablePromise<TResult, any> {
    return promise;
  };
}

/**
 * The reason a rejection handler receives.
 *
 * It is the declared failure when the promise declares one. When the failure is undeclared
 * (`unknown`), the promise declares nothing (`never`), or the set is open (it includes
 * {@link Unlisted}), the reason is `any`, the same as a native promise's reason.
 */
export type TReason<TFailure> =
  [TFailure] extends [never] ? any
  : [Extract<TFailure, Unlisted>] extends [never] ?
    // TFailure right of `extends` is invariant on TS 4.2, test a copy
    [TFailure] extends [infer F] ?
      unknown extends F ?
        any
      : F
    : never
  : any;

type TNoInfer<T> = [T][T extends any ? 0 : never];

export type TPromiseExecutor<TResult> = (
  resolve: (value?: TResult | PromiseLike<TResult>) => void,
  reject: (reason?: any) => void,
) => void;

/**
 * Context object passed as the executor's third argument. Both methods are closures bound to the
 * promise when the context is built, so `this: void` is accurate and destructuring them off the
 * context (the documented idiom) stays safe.
 */
export interface IExecutorContext<TResult = any, TFailure = unknown> {
  /** Register a cleanup handler that runs when the promise is canceled. */
  handleCancel(this: void, onCancel: TOnCancel): CancelablePromise<TResult, TFailure>;
  /**
   * Get an AbortSignal that aborts when the promise is canceled. Lazily creates an AbortController on first call.
   * The signal's `reason` is the CancelError the promise rejects with. A first call after the promise was canceled
   * returns an already aborted signal.
   * @deprecated Use `signal`.
   */
  getSignal(this: void): IAbortSignal;
  /**
   * The AbortSignal returned by `getSignal()`. Reading it creates the AbortController on first access, exactly as
   * the first `getSignal()` call does. The property is an inherited non-enumerable getter, so `Object.keys`, spread
   * and `JSON.stringify` neither copy it nor create the controller. Destructuring it in the executor
   * (`(resolve, reject, { signal }) => ...`) reads it once.
   */
  readonly signal: IAbortSignal;
}

export type TCancelablePromiseExecutor<TResult, TFailure = unknown> = (
  resolve: (value?: TResult | PromiseLike<TResult>) => void,
  // bare TFailure keeps a generic failure assignable, TReason hides it behind infer
  reject: (reason?: TFailure | TReason<TFailure> | CancelError) => void,
  ctx: IExecutorContext<TResult, TFailure>,
) => void;
export type TCancelReason = string | object | CancelError;
export type TCancelFn = (reason?: TCancelReason) => void;
// A cancel handler may return a thenable: awaitable cancel mode waits for it before the cascade
// settles, which is what makes `await cancel()` mean "cleanup is done".
export type TOnCancel = (reason?: TCancelReason) => void | PromiseLike<unknown>;

export interface IHandleCancelOptions {
  /**
   * Fire the handler even if the promise is ALREADY canceled at registration time. The handler is
   * called asynchronously (microtask) with the original cancel reason instead of being a silent
   * no-op. Under `strict` this also suppresses the throw for this call. Default: false.
   */
  immediate?: boolean;
}
export type TCancelablePromiseStates = 'PENDING' | 'FORCE_PENDING' | 'FULFILLED' | 'REJECTED' | 'CANCELED';

export interface ICancelablePromiseFlagOptions {
  /**
   * Awaitable cancel mode: cancel() returns a promise covering all transitive cleanup. With
   * `asyncCancel: false` cancel() returns `undefined`, and the cleanup of a parent reached by
   * bubbling runs two microtasks after cancel() returns.
   */
  asyncCancel?: boolean;
  /**
   * Keeps the current promise cancelable when native promise is provided through resolve(). A `.then()` child
   * inherits the value when it is created; a later write applies only to promises created after it.
   */
  forceCancelable?: boolean;
  /**
   * Cancellation propagates to parent promise. A promise is bubble-canceled once no consumer
   * remains after the current synchronous turn; a consumer subscribed anywhere in that turn, canc
   * or native, keeps it alive. A chain of promises with an overridden `cancel` bubbles recursively; very deep
   * chains of them can exhaust the stack. A `.then()` child inherits the `bubble` value at its creation and is
   * counted with it; a later write applies only to children created after it.
   */
  bubble?: boolean;
  /** Throw on cancellation problems */
  strict?: boolean;
  /**
   * Protects this promise's own pending work from cancellation initiated from below or outside:
   * a direct `cancel()` is a silent no-op (or throws under `strict`), and a bubble-cancel arriving
   * from canceled children is stopped here.
   *
   * This is an UPWARD/self shield only. Unlike Kotlin's `NonCancellable` or `asyncio.shield`,
   * which protect a running job from cancellation of the whole scope, `shield` does NOT stop
   * downward propagation: if this promise's own upstream is canceled or rejected, this promise
   * still adopts that rejection (native Promise semantics: down-propagation cannot be intercepted
   * without breaking try/catch). It is per-node and is not inherited by `then`-derived children.
   */
  shield?: boolean;
}

export interface ICancelablePromiseOptions extends ICancelablePromiseFlagOptions {
  signal?: IAbortSignal | IAbortSignal[];
}

/**
 * Common shape for options accepted by standalone cancellation helpers (forceCancelable/
 * makeCancelable and friends): lets a caller swap in a different CancelablePromise-compatible
 * constructor instead of always using the built-in class.
 */
export interface ICancelableHelperOptions extends ICancelablePromiseOptions {
  CancelablePromise?: typeof CancelablePromise;
}

interface IAbortSignal {
  readonly aborted: boolean;
  readonly reason?: any;
  addEventListener(type: 'abort', listener: any, options?: unknown): void;
  removeEventListener(type: 'abort', listener: any, options?: unknown): void;
}

interface IAbortControllerLike {
  abort(reason?: unknown): void;
  readonly signal: IAbortSignal;
}

/** Outcome of a fulfilled input in `allSettled`. Same shape as the ES2020 lib type of the same role. */
export interface ISettledFulfilled<T> {
  status: 'fulfilled';
  value: T;
}

/** Outcome of a rejected input in `allSettled`. Same shape as the ES2020 lib type of the same role. */
export interface ISettledRejected {
  status: 'rejected';
  reason: any;
}

/**
 * Outcome of one input in `allSettled`.
 *
 * Declared here so the emitted types do not depend on the ES2020 lib, which a consumer targeting
 * an older `lib` does not have. It has the same shape as the lib type of the same role.
 */
export type ISettledResult<T> = ISettledFulfilled<T> | ISettledRejected;

export interface ICancelable<TResult = any> extends PromiseLike<TResult> {
  cancel(reason?: any): any;
}

export interface ICancelablePromiseWithResolvers<TResult, TFailure = unknown> {
  promise: CancelablePromise<TResult, TFailure>;
  resolve: (value: TResult | PromiseLike<TResult>) => void;
  // Deliberately wide, unlike the executor's reject.
  // This one is the producer handle handed to
  // library code (coroutine drivers, adapters), which forwards whatever a foreign body threw.
  reject: (reason?: any) => void;
  cancel: (reason?: any) => void | CancelablePromise<ISettledResult<unknown>[], never>;
}

function noop() {
  /**/
}

// a cancel that reaches a finally child while its cleanup runs, applied once the cleanup settles
interface ICleanupDrain {
  canceled: boolean;
  reason?: unknown;
  disposing?: boolean;
  collector?: any[];
  done?: PromiseLike<void>;
  release?: () => void;
}

// kept off the class declaration so the emitted types stay unchanged
interface IDrainHolder {
  _cleanupDrain?: ICleanupDrain;
}

// Cleanup-collector threading: the INITIATOR's cancel() allocates a collector array and sets this
// before dispatching handlers.
// Synchronous re-entrant cancels (bubble, cascade) read it to push
// their handler results into the same collector.
// Restored after dispatch (stack discipline).
let _activeCollector: any[] | undefined;

// set while a deferred bubble cancels its parent, the cascade above it runs synchronously
let _inDeferredBubble = false;

// a deferred bubble runs its cascade from a stack, recursion overflows on a deep chain;
// a parent's frame lands on top, so it still runs before the rest of its child's list
interface ICancelFrame {
  promise: CancelablePromise<any, any>;
  handlers: TOnCancel[];
  next: number;
  reason: TCancelReason | undefined;
  // always set: a deferred bubble runs with a collector of its own
  collector: any[];
}
const _cancelFrames: ICancelFrame[] = [];
// true while the frame loop calls a handler, a cancel() made inside one runs its list in place
let _inFrameHandler = false;
// claimed by the next _runCancellation, which leaves its handlers to the frame loop
let _queueHandlers = false;
// promises a deferred bubble canceled, released from its collector once that settles
let _deferredCanceled: CancelablePromise<any, any>[] | undefined;

function runCancelFrames(): void {
  for (;;) {
    const frame = _cancelFrames[_cancelFrames.length - 1];
    if (!frame) {
      return;
    }
    if (frame.next === frame.handlers.length) {
      _cancelFrames.pop();
      continue;
    }
    const handler = frame.handlers[frame.next++];
    const { promise, reason, collector } = frame;
    _activeCollector = collector;
    try {
      if (promise.asyncCancel) {
        const This = promise.constructor as typeof CancelablePromise;
        collector.push(new This((resolve) => resolve(handler(reason))));
      } else {
        const result = handler(reason);
        // sync strict refuses a thenable, a bubble has nobody to report that to
        if (isThenable(result) && !promise.strict) {
          result.then(noop, noop);
        }
      }
    } catch (_e) {
      // a parent's handler error never reaches the child's canceler
    }
  }
}

// what a deferred bubble collected, listed in place of its own collector entry
class DeferredCleanup {
  constructor(readonly results: ISettledResult<unknown>[]) {}
}

function flattenCleanup(results: ISettledResult<unknown>[]): ISettledResult<unknown>[] {
  let flat: ISettledResult<unknown>[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value instanceof DeferredCleanup) {
      flat = flat.concat(flattenCleanup(result.value.results));
    } else {
      flat.push(result);
    }
  }
  return flat;
}

function toSettledResult(entry: unknown): Promise<ISettledResult<unknown>> {
  return NativePromise.resolve(entry).then(
    (value): ISettledResult<unknown> => ({ status: 'fulfilled', value }),
    (reason: unknown): ISettledResult<unknown> => ({ status: 'rejected', reason }),
  );
}

// native twin of settleCleanup: a deferred bubble adds no allSettled call of its own
function settleDeferredCleanup(collector: any[], onDone: () => void): Promise<DeferredCleanup> {
  let settled: ISettledResult<unknown>[] = [];
  const drain = (): Promise<DeferredCleanup> =>
    NativePromise.all(collector.slice(settled.length).map(toSettledResult)).then((results) => {
      settled = settled.concat(results);
      if (collector.length > settled.length) {
        return drain();
      }
      onDone();
      return new DeferredCleanup(settled);
    });
  return drain();
}

// cancel marks CANCELED before it rejects and the settlers drop a non-PENDING
// promise, so this flag carries that one rejection through to the native promise
let _rejectingCanceled = false;

// one rule for cancel() and both abort paths, the raw reason still goes to the handlers
function toCancelError(reason: unknown): CancelError {
  return (
    isCancelError(reason) ? reason
    : isObject(reason) ? new CancelError(undefined, { cause: reason })
    : new CancelError(reason as string | undefined)
  );
}

function rejectCanceled(settle: (reason?: any) => void, error: unknown): void {
  _rejectingCanceled = true;
  try {
    settle(error);
  } finally {
    _rejectingCanceled = false;
  }
}

// settles with every entry of a cleanup collector, including entries a race bubble appends later
function settleCleanup(
  This: typeof CancelablePromise,
  collector: any[],
  onDone?: () => void,
): CancelablePromise<ISettledResult<unknown>[], never> {
  const { promise, resolve } = This.withResolvers<ISettledResult<unknown>[], never>();
  let settled: ISettledResult<unknown>[] = [];
  const finish = (): void => {
    if (onDone) {
      onDone();
    }
    resolve(flattenCleanup(settled));
  };
  const drain = (): void => {
    void This.allSettled(collector.slice(settled.length)).then((results) => {
      settled = settled.concat(results);
      if (collector.length > settled.length) {
        drain();
      } else {
        finish();
      }
    }, finish);
  };

  drain();
  return promise;
}

// plain boolean: a narrowing guard would leave the other copy branch typed never
function isThisCopy(value: unknown): boolean {
  return value instanceof CancelablePromise;
}

interface IReleaser {
  (): void;
  add(release: (() => void) | undefined): void;
}

// combinator side of the counted input refs, released all at once
function createReleaser(): IReleaser {
  let releases: Array<() => void> | undefined = [];
  const releaseAll = (() => {
    const pending = releases;
    releases = undefined;
    if (!pending) {
      return;
    }
    for (const release of pending) {
      try {
        release();
      } catch (_e) {
        // one input's cleanup error must not keep the others held
      }
    }
  }) as IReleaser;
  releaseAll.add = (release) => {
    if (!release) {
      return;
    }
    if (releases) {
      releases.push(release);
    } else {
      release();
    }
  };
  return releaseAll;
}

function releaseOnCancel(result: CancelablePromise<any, any>): IReleaser {
  const releaseInputs = createReleaser();
  if (result.canceled) {
    // born canceled by a pre-aborted signal: each input is released as it is added
    releaseInputs();
  } else {
    // one handler per combinator, the release itself guards against a second run
    result.handleCancel(() => releaseInputs());
  }
  return releaseInputs;
}

// a canceled child gives up what its callback returned and keeps a late rejection handled
function reclaimOrphanedResult(value: unknown, reason: unknown): void {
  if (isCancPromise(value)) {
    const linked = value as unknown as {
      _retainRef?: () => (() => void) | undefined;
      _chain?: (child: CancelablePromise<void>) => void;
      _subscribe?: (onFulfilled: undefined, onRejected: () => void) => void;
    };
    try {
      if (typeof linked._retainRef === 'function' && typeof linked._subscribe === 'function') {
        // skips the consumer count the public `then` would add
        linked._subscribe(undefined, noop);
        // release one counted ref; the source stops only when no other consumer is left
        const release = linked._retainRef();
        if (release) {
          release();
        }
      } else if (typeof linked._chain === 'function' && typeof linked._subscribe === 'function') {
        // an older copy without `_retainRef` releases through a canceled stand-in child
        linked._subscribe(undefined, noop);
        // release one counted ref; the source stops only when no other consumer is left
        const standIn = new CancelablePromise<void>(noop);
        linked._chain(standIn);
        void standIn.cancel(reason);
      } else {
        // a copy without `_chain` is reached through its `then` view, never canceled directly
        const view = value.then(noop, noop) as unknown as { cancel?: unknown };
        if (view && typeof view.cancel === 'function') {
          void (view.cancel as (reason?: unknown) => unknown)(reason);
        }
      }
    } catch (_e) {
      // strict refuses to cancel a shielded promise, nobody is left to report it to
    }
  } else if (isObject(value) || isFunction(value)) {
    // a throwing `then` getter becomes a rejection, absorbed by the same handler
    void NativePromise.resolve(value).then(undefined, noop);
  }
}

const states = {
  PENDING: 'PENDING',
  FORCE_PENDING: 'FORCE_PENDING',
  FULFILLED: 'FULFILLED',
  REJECTED: 'REJECTED',
  CANCELED: 'CANCELED',
} as { [key in TCancelablePromiseStates]: key };

// Packed flag bits for the per-instance `_flags` int.
// Replacing five boolean own-properties with
// one small integer is the bulk of the per-instance memory reduction; the public boolean read/write
// API (`p.bubble` etc) is preserved by prototype getter/setters that read/write these bits.
const FLAG_ASYNC_CANCEL = 1;
const FLAG_FORCE_CANCELABLE = 2;
const FLAG_BUBBLE = 4;
const FLAG_STRICT = 8;
const FLAG_SHIELD = 16;

// parent forceCancelable set by `_then` for the child it constructs, on every engine path
let _thenChildForceCancelable = true;

// Shared options for internal species construction to avoid allocation
// Frozen to prevent future mutation from poisoning every derived promise
const INTERNAL_CALL_OPTIONS = Object.freeze({ forceCancelable: true }) as Readonly<
  ReturnType<(typeof CancelablePromise)['_getOptions']>
>;

// combinator inputs are adopted with default flags whatever the result's options
const INPUT_OPTIONS: ICancelablePromiseOptions = Object.freeze({});

// a plain constructor so every context shares one map and inherits the signal getter
const ExecutorContext = function ExecutorContext(
  this: IExecutorContext,
  handleCancel: IExecutorContext['handleCancel'],
  getSignal: IExecutorContext['getSignal'],
) {
  this.handleCancel = handleCancel;
  this.getSignal = getSignal;
} as unknown as new <TResult, TFailure>(
  handleCancel: IExecutorContext<TResult, TFailure>['handleCancel'],
  getSignal: IExecutorContext<TResult, TFailure>['getSignal'],
) => IExecutorContext<TResult, TFailure>;

// one shared getter: a per-context getter closure turns every context into a dictionary
Object.defineProperty(ExecutorContext.prototype, 'signal', {
  configurable: true,
  get: function (this: IExecutorContext): IAbortSignal {
    return this.getSignal();
  },
});

// Extends PromiseConstructor, as defined in
// lib.es2015.promise, lib.es2015.iterable, lib.es2015.symbol.wellknown, lib.es2018.promise,
// lib.es2020.promise, lib.es2021.promise.d.ts, lib.esnext.promise.d.ts
/**
 * A promise that can be canceled.
 *
 * @typeParam TResult The value the promise fulfills with.
 * @typeParam TFailure What the promise declares it rejects with. Left out, it is `unknown` and the
 * failure is undeclared, as on a native promise. `never` declares that nothing is expected to
 * reject it.
 */
class CancelablePromise<TResult, TFailure = unknown> implements ICancelable<TResult>, Promise<TResult> {
  // declare prevents emitting an own property that would shadow inherited getter
  // useDefineForClassFields:false locked to preserve species resolution
  // If target bumps to es2022 a bare field emits undefined and breaks species
  // Broken species downgrades then-derived promises to plain native Promises
  declare static readonly [Symbol.species]: PromiseConstructor;

  protected static _pendingInternalCall = false;

  /** @internal Exposed for coroutine cancel override to read the active collector. */
  protected static get _activeCollector(): any[] | undefined {
    return _activeCollector;
  }

  static defaultOptions: Required<ICancelablePromiseFlagOptions> = {
    asyncCancel: true,
    forceCancelable: true,
    bubble: true,
    strict: false,
    shield: false,
  };

  /**
   * Creates a Promise that is resolved with an array of results when all of the provided Promises
   * resolve, or rejected when any Promise is rejected.
   * @param values An array of Promises.
   * @param [options]
   * @returns A new Promise.
   */
  static all<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(
    values: readonly [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10],
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<
    [
      Awaited<T1>,
      Awaited<T2>,
      Awaited<T3>,
      Awaited<T4>,
      Awaited<T5>,
      Awaited<T6>,
      Awaited<T7>,
      Awaited<T8>,
      Awaited<T9>,
      Awaited<T10>,
    ],
    | FailureOf<T1>
    | FailureOf<T2>
    | FailureOf<T3>
    | FailureOf<T4>
    | FailureOf<T5>
    | FailureOf<T6>
    | FailureOf<T7>
    | FailureOf<T8>
    | FailureOf<T9>
    | FailureOf<T10>
  >;
  static all<T1, T2, T3, T4, T5, T6, T7, T8, T9>(
    values: readonly [T1, T2, T3, T4, T5, T6, T7, T8, T9],
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<
    [
      Awaited<T1>,
      Awaited<T2>,
      Awaited<T3>,
      Awaited<T4>,
      Awaited<T5>,
      Awaited<T6>,
      Awaited<T7>,
      Awaited<T8>,
      Awaited<T9>,
    ],
    | FailureOf<T1>
    | FailureOf<T2>
    | FailureOf<T3>
    | FailureOf<T4>
    | FailureOf<T5>
    | FailureOf<T6>
    | FailureOf<T7>
    | FailureOf<T8>
    | FailureOf<T9>
  >;
  static all<T1, T2, T3, T4, T5, T6, T7, T8>(
    values: readonly [T1, T2, T3, T4, T5, T6, T7, T8],
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<
    [Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>, Awaited<T8>],
    | FailureOf<T1>
    | FailureOf<T2>
    | FailureOf<T3>
    | FailureOf<T4>
    | FailureOf<T5>
    | FailureOf<T6>
    | FailureOf<T7>
    | FailureOf<T8>
  >;
  static all<T1, T2, T3, T4, T5, T6, T7>(
    values: readonly [T1, T2, T3, T4, T5, T6, T7],
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<
    [Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>, Awaited<T7>],
    FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6> | FailureOf<T7>
  >;
  static all<T1, T2, T3, T4, T5, T6>(
    values: readonly [T1, T2, T3, T4, T5, T6],
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<
    [Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>, Awaited<T6>],
    FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5> | FailureOf<T6>
  >;
  static all<T1, T2, T3, T4, T5>(
    values: readonly [T1, T2, T3, T4, T5],
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<
    [Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>, Awaited<T5>],
    FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4> | FailureOf<T5>
  >;
  static all<T1, T2, T3, T4>(
    values: readonly [T1, T2, T3, T4],
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<
    [Awaited<T1>, Awaited<T2>, Awaited<T3>, Awaited<T4>],
    FailureOf<T1> | FailureOf<T2> | FailureOf<T3> | FailureOf<T4>
  >;
  static all<T1, T2, T3>(
    values: readonly [T1, T2, T3],
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<[Awaited<T1>, Awaited<T2>, Awaited<T3>], FailureOf<T1> | FailureOf<T2> | FailureOf<T3>>;
  static all<T1, T2>(
    values: readonly [T1, T2],
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<[Awaited<T1>, Awaited<T2>], FailureOf<T1> | FailureOf<T2>>;
  static all<TResult>(
    values: readonly TResult[],
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<Awaited<TResult>[], FailureOf<TResult>>;
  static all<TAll>(
    values: Iterable<TAll | PromiseLike<TAll>>,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<TAll[], FailureOf<TAll>>;

  static all<TAll>(
    values: Iterable<TAll | PromiseLike<TAll>>,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<TAll[], FailureOf<TAll>> {
    // Deferred-construction pattern to work around referring to the promise from inside its own
    // executor: withResolvers() is the same `new this(noop, options)` internally, just named/shaped
    // for this exact use.
    const {
      promise: resultsPromise,
      resolve: resolveResults,
      reject: rejectResults,
    } = this.withResolvers<TAll[], FailureOf<TAll>>(options);

    const releaseInputs = releaseOnCancel(resultsPromise);

    try {
      const results: TAll[] = [];
      let count = 0;

      for (const promiseOrValue of values) {
        const index = count++;
        const promise = this._adopt(promiseOrValue, INPUT_OPTIONS);

        // a pure reaction sink, the one counted ref below is the only consumer it adds
        promise._subscribe(
          (value) => {
            results[index] = value;

            if (!--count) {
              resolveResults(results);
            }
          },
          (error) => {
            // the first rejection settles the result, the other inputs lose their consumer
            releaseInputs();
            rejectResults(error);
          },
        );

        releaseInputs.add(promise._retainRef());
      }

      if (!count) {
        resolveResults(results);
      }
    } catch (error) {
      // a throwing iterable gives up the inputs it already yielded
      releaseInputs();
      rejectResults(error);
    }

    return resultsPromise;
  }

  /**
   * Creates a Promise that is resolved with an array of results when all
   * of the provided Promises resolve or reject.
   * @param values An array of Promises.
   * @param [options]
   * @returns A new Promise.
   */
  static allSettled<T extends readonly unknown[] | readonly [unknown]>(
    values: T,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<
    {
      -readonly [P in keyof T]: ISettledResult<Awaited<T[P]>>;
    },
    never
  >;
  static allSettled<T>(
    values: Iterable<T>,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<ISettledResult<Awaited<T>>[], never>;

  static allSettled<T>(
    values: Iterable<T>,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<ISettledResult<any>[] | { [P in keyof any]: ISettledResult<any> }, never> {
    // The spread stays outside any try so an iterable that throws while iterating surfaces
    // synchronously (documented behavior), not as a rejected aggregate.
    return this.all(
      [...values].map(
        (promiseOrValue) =>
          // `_adopt` reuses a same-constructor canc input as-is and only wraps raw values /
          // foreign thenables, dropping the former unconditional resolve() wrap that ran a full
          // construction per item on top of the one all() performs on the mapped result.
          this._adopt(promiseOrValue, INPUT_OPTIONS).then(
            (value) => ({ status: 'fulfilled', value }),
            (reason: unknown) => ({ status: 'rejected', reason }),
          ) as CancelablePromise<ISettledResult<any>, never>,
      ),
      options,
    );
  }

  /**
   * The any function returns a promise that is fulfilled by the first given promise to be fulfilled, or rejected with an AggregateError containing an array of rejection reasons if all of the given promises are rejected. It resolves all elements of the passed iterable to promises as it runs this algorithm.
   * @param values An array or iterable of Promises.
   * @param [options]
   * @returns A new Promise.
   */

  static any<T extends readonly unknown[] | []>(
    values: T,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<Awaited<T[number]>, AggregateError | Unlisted>;
  static any<T>(
    values: Iterable<T | PromiseLike<T>>,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<Awaited<T>, AggregateError | Unlisted>;

  static any<T>(
    values: Iterable<T | PromiseLike<T>>,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<Awaited<T>, AggregateError | Unlisted> {
    // Deferred-construction pattern: see all() above.
    const {
      promise: resultPromise,
      resolve: resolveResult,
      reject: rejectResult,
    } = this.withResolvers<Awaited<T>, AggregateError | Unlisted>(options);

    // Indexed by input position (spec order), not settlement order
    const errors: unknown[] = [];
    const releaseInputs = releaseOnCancel(resultPromise);
    let count = 0;
    let rejectedCount = 0;

    try {
      for (const promiseOrValue of values) {
        const index = count++;
        const promise = this._adopt(promiseOrValue, INPUT_OPTIONS);

        promise._subscribe(
          (value) => {
            // the first fulfillment settles the result, the other inputs lose their consumer
            releaseInputs();
            // value is T (unresolved-thenable element type), not yet Awaited<T>: same
            // looseness the previous `resultPromise._resolve(value)` (typed `any`) had.
            resolveResult(value as Awaited<T>);
          },
          (error: unknown) => {
            errors[index] = error;
            rejectedCount++;

            if (rejectedCount === count) {
              rejectResult(createAggregateError(errors, 'All promises were rejected'));
            }
          },
        );

        releaseInputs.add(promise._retainRef());
      }

      if (!count) {
        rejectResult(createAggregateError(errors, 'All promises were rejected'));
      }
    } catch (error) {
      // a throwing iterable gives up the inputs it already yielded
      releaseInputs();
      rejectResult(error);
    }

    return resultPromise;
  }

  /**
   * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
   * or rejected.
   * @param values An array of Promises.
   * @param [options]
   * @returns A new Promise.
   */
  // with one T a canc member subtype-reduces into a native one, failure lost
  static race<T extends readonly unknown[] | []>(
    values: T,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<Awaited<T[number]>, FailureOf<T[number]>>;
  static race<T>(
    values: readonly T[],
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<Awaited<T>, FailureOf<T>>;
  static race<T>(values: Iterable<T>, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>, FailureOf<T>>;
  static race<T>(
    values: Iterable<T | PromiseLike<T>>,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<T, FailureOf<T>>;

  static race<T>(
    values: Iterable<T | PromiseLike<T>>,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<T, FailureOf<T>> {
    // Deferred-construction pattern: see all() above.
    const {
      promise: resultPromise,
      resolve: resolveResult,
      reject: rejectResult,
    } = this.withResolvers<T, FailureOf<T>>(options);

    // a canceled race needs none of its inputs; no reaction on the result itself, which
    // would mark it handled and hide its rejection from the unhandled-rejection report
    const releaseInputs = releaseOnCancel(resultPromise);
    // the first input to settle the race releases every input, the winner included
    const releaseOnSettle = (): void => {
      const prev = _activeCollector;
      _activeCollector = resultPromise._collector;
      try {
        releaseInputs();
      } finally {
        _activeCollector = prev;
      }
    };

    try {
      for (const promiseOrValue of values) {
        const promise = this._adopt<T>(promiseOrValue, INPUT_OPTIONS);
        promise._subscribe(
          (value) => {
            resolveResult(value);
            releaseOnSettle();
          },
          (error: unknown) => {
            rejectResult(error as FailureOf<T>);
            releaseOnSettle();
          },
        );

        releaseInputs.add(promise._retainRef(true));
      }
    } catch (error) {
      // a throwing iterable settles the race and gives up the inputs it already yielded
      rejectResult(error);
      releaseOnSettle();
    }

    return resultPromise;
  }

  /**
   * Creates a new rejected promise for the provided reason.
   * @param reason The reason the promise was rejected.
   * @param [options]
   * @returns A new rejected Promise.
   */
  // the reason never infers TFailure, as on a native promise; a supplied one checks it
  static reject<TResult = never, TFailure = never>(
    reason?: [TFailure] extends [never] ? any : TNoInfer<TFailure>,
    options?: ICancelablePromiseOptions,
  ): CancelablePromise<TResult, TFailure> {
    return new this<TResult, TFailure>((_resolve, reject) => {
      reject(reason);
    }, options);
  }

  /**
   * Creates a rejected promise that declares the type of its error as the failure.
   * Unlike {@link CancelablePromise.reject}, the error argument infers the failure, so returning it from a
   * `then` callback declares the failure on the chain. A `CancelError` is cancellation and is never declared.
   * @param error The error the promise rejects with, as is.
   * @returns A new rejected promise.
   */
  static fail<TError>(error: TError): CancelablePromise<never, Exclude<TError, CancelError>> {
    // the executor reject accepts any reason, so the declared failure is only the return type
    return new this<never, any>((_resolve, reject) => {
      reject(error);
    });
  }

  /**
   * Creates a new resolved promise for the provided value.
   * @param value A promise.
   * @param [options]
   * @returns A promise whose internal state matches the provided promise.
   */
  static resolve<V>(value: V, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<V>, FailureOf<V>>;
  static resolve(): CancelablePromise<void, never>;

  static resolve<V>(value?: V, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<V>, FailureOf<V>> {
    if (
      value instanceof this &&
      value.constructor === this &&
      // Same shape as `_adopt`'s check below: narrowing `value` to the class's own options
      // shape, not to `any`, mirrors the established pattern for this instanceof-narrowed cast.
      !this._checkOptionsChanged(value as unknown as ICancelablePromiseOptions, options)
    ) {
      // Return unmodified promise similarly to Promise.resolve. `value instanceof this` proves
      // the runtime shape but not the generic identity (V's own TResult/TFailure vs Awaited<V>/
      // FailureOf<V>) that the compiler cannot correlate through a polymorphic `this` check.
      return value as unknown as CancelablePromise<Awaited<V>, FailureOf<V>>;
    } else {
      // Wrap other promise instances or reconfigure same instances
      let adopted = false;
      const wrapper = new this<Awaited<V>, FailureOf<V>>((resolve) => {
        adopted = true;
        // Native Promise.resolve() semantics: coercing V to Awaited<V> here is the same
        // unification lib.es5's own overloaded Promise.resolve signatures encode by hand;
        // there is no single-signature way to prove it generically.
        resolve(value as unknown as Awaited<V> | PromiseLike<Awaited<V>>);
      }, options);
      if (!adopted && isCancPromise(value)) {
        // pre-abort skipped the executor, release the source as a live abort would
        reclaimOrphanedResult(value, wrapper._canceledReason);
      }
      return wrapper;
    }
  }

  /**
   * Creates a new Promise and returns it in an object, along with its resolve and reject functions.
   * @param [options]
   * @returns An object with the properties `promise`, `resolve`, and `reject`.
   */
  static withResolvers<TResult, TFailure = unknown>(
    options?: ICancelablePromiseOptions,
  ): ICancelablePromiseWithResolvers<TResult, TFailure> {
    const promise = new this<TResult, TFailure>(noop, options);

    return {
      promise,
      resolve: promise._resolve,
      reject: promise._reject,
      cancel: promise._getBoundCancel(),
    };
  }

  /**
   * Invokes `fn` with `args`, wrapping both a synchronous throw and the returned value/promise
   * into a single settled CancelablePromise. Lets callers use `.catch`/cancellation uniformly
   * around code that may throw synchronously instead of always rejecting asynchronously.
   * @param fn Function to invoke, may throw synchronously or return a value/thenable.
   * @param args Arguments passed through to `fn`.
   */
  static try<T, TArgs extends any[]>(
    fn: (...args: TArgs) => T,
    ...args: TArgs
  ): CancelablePromise<Awaited<T>, FailureOf<T>> {
    return new this<Awaited<T>, FailureOf<T>>((resolve, reject) => {
      try {
        // Same coercion as resolve()'s executor: fn's return type T unifies to Awaited<T> the
        // way native Promise.resolve()'s hand-written overloads do, not provable generically.
        resolve(fn(...args) as unknown as Awaited<T> | PromiseLike<Awaited<T>>);
      } catch (error) {
        // A synchronous throw from `fn` is undeclared, so it cannot narrow to the inferred set.
        reject(error as TReason<FailureOf<T>>);
      }
    });
  }

  protected static _getOptions(options?: ICancelablePromiseOptions) {
    const mergedOptions: ICancelablePromiseOptions & Required<ICancelablePromiseFlagOptions> = {
      ...this.defaultOptions,
    };

    if (options) {
      if ('bubble' in options) {
        mergedOptions.bubble = !!options.bubble;
      }

      if ('strict' in options) {
        mergedOptions.strict = !!options.strict;
      }

      if ('asyncCancel' in options) {
        mergedOptions.asyncCancel = !!options.asyncCancel;
      }

      if ('forceCancelable' in options) {
        mergedOptions.forceCancelable = !!options.forceCancelable;
      }

      if ('shield' in options) {
        mergedOptions.shield = !!options.shield;
      }

      if ('signal' in options) {
        mergedOptions.signal = options.signal || undefined;
      }
    }

    return mergedOptions;
  }

  /**
   * Combinator input adoption. Behaviorally identical to `resolve(value, normalizedOptions)` but
   * with the fast path inlined: an already-same-constructor CancelablePromise whose options are
   * unchanged is returned as-is (fast instanceof + constructor check), skipping the extra static
   * dispatch. Any other input (raw value, native thenable, reconfigured canc promise) falls back to
   * a direct construction. Combinators pass `INPUT_OPTIONS`: their own options apply to the result only.
   */
  protected static _adopt<T>(
    value: T | PromiseLike<T>,
    normalizedOptions: ICancelablePromiseOptions,
  ): CancelablePromise<T> {
    if (
      value instanceof this &&
      value.constructor === this &&
      !this._checkOptionsChanged(value as unknown as ICancelablePromiseOptions, normalizedOptions)
    ) {
      // Same-constructor canc promise with unchanged options: reuse as-is (matches resolve()).
      return value as unknown as CancelablePromise<T>;
    }
    // Wrap raw values / native thenables / reconfigured canc promises.
    // Constructing directly
    // (instead of routing back through resolve) avoids repeating the instanceof + options check
    // that just failed above.
    return new this<T>((resolve) => {
      resolve(value);
    }, normalizedOptions);
  }

  protected static _checkOptionsChanged(
    instance: ICancelablePromiseOptions,
    options?: ICancelablePromiseOptions,
  ): boolean {
    if (!options) {
      return false;
    }

    const keys: Array<keyof ICancelablePromiseOptions> = [
      'asyncCancel',
      'forceCancelable',
      'bubble',
      'strict',
      'shield',
      'signal',
    ];

    for (const key of keys) {
      if (options[key] !== undefined && instance[key] !== options[key]) {
        return true;
      }
    }

    return false;
  }

  // `declare`: type-only, same "no emit" rationale as the static species field above.
  // Never actually assigned; the inherited Promise.prototype[Symbol.toStringTag] getter
  // ("Promise") is what callers observe.
  // Keeping it declare-only avoids a future
  // defineForClassFields:true target creating an own `undefined` property that would shadow
  // that inherited getter.
  declare readonly [Symbol.toStringTag]: string;

  // `declare`: assigned once on prototype at module load so all instances inherit same brand
  declare readonly [CANCEL_PROMISE_BRAND]: true;
  declare readonly [FAILURE]?: Exclude<TFailure, CancelError>;

  // per-instance own-property layout (kept small; see memory notes below):
  // _flags packed booleans (asyncCancel/forceCancelable/bubble/strict/shield),
  // read/written through the prototype getters/setters below
  // _internalState state-machine string
  // _resolve/_reject the wrapped settlement functions
  // _cancelHandlers lazily allocated only when handleCancel() actually registers one
  // _abortSignals/_abortListeners lazily allocated only when a signal is wired
  // _chainsCount/_completedChainsCount bubble bookkeeping (only touched when chained)
  // _pendingSyncCancel(+Reason) transient sync-executor cancel handoff
  // _canceledReason/_isCanceledReasonSet retained for late immediate handlers
  // cancel bound copy, installed lazily on first read (see the accessor below)
  // The five public flag booleans (asyncCancel/forceCancelable/bubble/strict/shield) are NOT
  // per-instance fields anymore; they live in `_flags` and are exposed via prototype
  // getter/setters, so reading/writing `p.bubble` keeps working unchanged.

  // Cold fields default-valued on the PROTOTYPE (assigned once at module load, see below), NOT
  // per-instance. `declare` = zero per-instance emit; a read falls through to the shared prototype
  // default and a write lazily creates an own property only for the promises that actually diverge
  // (chained, canceled, sync-cancel handoff).
  // A plain resolved/rejected promise therefore carries
  // none of these as own slots.
  // Layout summary and rationale in the memory note above.
  declare protected _chainsCount: number;
  declare protected _completedChainsCount: number;
  declare protected _pendingSyncCancel: boolean;
  declare protected _pendingSyncCancelReason: any;
  declare protected _canceledReason: any;
  declare protected _isCanceledReasonSet: boolean;

  // Always own properties (per-instance): the settlement wrappers, the state machine, the packed
  // flags.
  // These differ per promise, so a prototype default would not help.
  protected _resolve!: (value?: any) => void;
  protected _reject!: (reason?: any) => void;
  // Initialized eagerly (not declare-only): the executor's resolve/reject wrappers read
  // `_internalState` on `tempThis` while it still runs synchronously, before the constructor's
  // copy block migrates it to the real instance, so the PENDING default must exist up front.
  protected _internalState: TCancelablePromiseStates = 'PENDING';
  protected _flags!: number;

  // lazily allocated on first handleCancel() registration to keep common case lean
  protected _cancelHandlers?: TOnCancel[];
  // Listener management for abort signals: maps each signal to its registered listener
  // function to allow removal on settle.
  // Lazily allocated only when a signal is wired
  // (the common case has no signal, so both stay undefined).
  protected _abortSignals?: IAbortSignal[];
  protected _abortListeners?: Map<IAbortSignal, any>;
  // Bound `cancel`, created lazily only when a detached reference is requested (withResolvers).
  protected _boundCancel?: CancelablePromise<TResult, TFailure>['cancel'];

  // cross-copy contract: fixed meaning, an incompatible change takes a new suffixed name
  // Cleanup collector stored on the instance so async bubbles (bubbleOnComplete .then()) can
  // read it after _activeCollector has been restored.
  protected _collector?: any[];

  /**
   * Creates a new Promise.
   * @param executor A callback used to initialize the promise.
   * @param [options]
   */
  constructor(executor: TCancelablePromiseExecutor<TResult, TFailure>, options?: ICancelablePromiseOptions) {
    if (!(this instanceof CancelablePromise)) {
      throw new TypeError(`CancelablePromise constructor cannot be invoked without 'new'`);
    }

    const This = new.target;
    // `this` when executor calls are synchronous, otherwise NativePromise instance
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the construction handoff below rebinds this to the Reflect.construct result
    let instance: CancelablePromise<TResult, TFailure> = this;
    // Stable reference to the temporary constructor `this` used to detect synchronous
    // executor settlement (before Reflect.construct returns the real promise instance).
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- both objects must stay reachable to migrate state off the temporary this
    const tempThis = this;
    // Set when a non-strict pre-aborted signal is detected.
    // The executor is NOT run in that
    // case (the promise is born canceled); the rejection is deferred to the real instance after
    // Reflect.construct so it settles the returned promise, not the throwaway temp `this`.
    // This
    // mirrors the _pendingSyncCancel handoff and keeps settler-release working normally (the
    // executor never settles synchronously, so the returned promise's live resolve/reject
    // wrappers survive for withResolvers to hand out).
    let pendingPreAbortReason: unknown = undefined;
    // Sentinel so a signal whose reason is genuinely undefined still triggers the deferred path.
    let hasPendingPreAbort = false;

    const isInternalSpeciesConstructionWithoutOptions = This._pendingInternalCall;
    const internalForceCancelable = _thenChildForceCancelable;

    // Only normalize options on the public path.
    // On the internal path `normalizedOptions` is a
    // tiny stand-in read by the resolve/reject wrappers (they only consult `forceCancelable`,
    // which defaults to true) without allocating the full merged-options object.
    const normalizedOptions =
      isInternalSpeciesConstructionWithoutOptions ? INTERNAL_CALL_OPTIONS : This._getOptions(options);

    // Pre-check for aborted signals BEFORE construction. `strict` throws here (executor must
    // never run for a strict pre-aborted signal); non-strict marks the deferred handoff so the
    // executor is skipped and the born-canceled rejection is applied to the real instance after
    // Reflect.construct.
    if (!isInternalSpeciesConstructionWithoutOptions && normalizedOptions.signal) {
      const signals = Array.isArray(normalizedOptions.signal) ? normalizedOptions.signal : [normalizedOptions.signal];
      const preAbortedSignal = signals.find((s) => s.aborted);
      if (preAbortedSignal) {
        if (normalizedOptions.strict) {
          throw new Error('Aborted signal cannot be reused');
        }
        pendingPreAbortReason = preAbortedSignal.reason as unknown;
        hasPendingPreAbort = true;
      }
    }

    // No class extends Promise and no super to survive ES5 transpilation
    // ES5 transpiles super to Y.call(this) which throws on native Promise
    // Reflect.construct builds genuine native Promise with new.target.prototype
    // Survives downleveling because it is a runtime call not class syntax
    // The returned native instance becomes the real instance
    // The original tempThis is used only while the executor runs synchronously
    // Changing this breaks ES5-targeting engines and transpilers

    instance = Reflect.construct(
      NativePromise,
      [
        ((resolve_, reject_) => {
          // first resolve wins as natively, cancel() still works while adopting
          let adopting = false;
          // the CancelError this promise rejected with, what getSignal() aborts with
          let cancelError: unknown;

          function resolve(value?: TResult | PromiseLike<TResult>): void {
            // Prevent cancellation in case of early state changes
            if (instance._internalState === states.PENDING) {
              if (adopting) {
                return;
              }

              if (value === (instance as unknown)) {
                // Self-resolution (e.g. `p.then(() => p)`).
                // Native Promise resolution
                // rejects a promise resolved with itself ("Chaining cycle detected"),
                // but the forceCancelable branch below adopts via `value.then(...)`
                // instead of `resolve_(value)`, so it would never reach native cycle
                // detection and would hang.
                // Reject with the same TypeError here and do
                // not enter the adoption-cancel branch, so self-cycles keep native
                // semantics without linking the promise to itself.
                reject(new TypeError('Chaining cycle detected for promise'));
                return;
              }

              // another copy's `_chain`/`_subscribe` are called by name, without them it
              // adopts through the public `then` and `cancel()`
              const adopted =
                isCancPromise(value) && typeof value._chain === 'function' && typeof value._subscribe === 'function' ?
                  value
                : undefined;
              let foreignThen: TAnyFn | undefined;
              if (!adopted && (isObject(value) || isFunction(value))) {
                // read once: a getter may count reads or throw, as native resolution allows
                let then: unknown;
                try {
                  then = (value as { then?: unknown }).then;
                } catch (error) {
                  reject(error);
                  return;
                }
                if (isFunction(then)) {
                  foreignThen = then;
                }
              }

              if (!adopted && !foreignThen) {
                instance._internalState = states.FULFILLED;
                // a settled child would keep its parent alive through the bubble handler
                if (instance._cancelHandlers) {
                  instance._cancelHandlers = undefined;
                }
                instance._runSettlementEffects();
                resolve_(value);
                return;
              }

              // Adopting another cancelable: link it into this promise's chain graph as
              // a counted parent, the same wiring a declared parent gets.
              // Cancel then
              // reaches the adopted promise only when every counted consumer is gone and
              // the value is unconsumed, and its own `bubble: false` / `shield: true`
              // are honored inside `_chain`/`cancel`.
              // This runs once per settle (not per
              // `.then()` call), and plain values / native promises / foreign thenables
              // never enter it.
              let keepView: ((view: unknown) => void) | undefined;
              if (adopted) {
                adopted._chain(instance);
              } else if (isCancPromise(value)) {
                // cancel goes through the `then` view, never the source: the source stops
                // only when its other consumers allow
                let view: unknown;
                let viewKept = false;
                let canceled = false;
                let cancelReason: unknown;
                const cancelView = (): void | PromiseLike<unknown> => {
                  try {
                    const cancel =
                      isObject(view) || isFunction(view) ? (view as { cancel?: unknown }).cancel : undefined;
                    if (isFunction(cancel)) {
                      const cleanup: unknown = cancel.call(view, cancelReason);
                      return isThenable(cleanup) ? cleanup : undefined;
                    }
                  } catch (_e) {
                    // strict refuses a shielded or settled view, this one is canceled anyway
                  }
                  return undefined;
                };
                keepView = (view_) => {
                  view = view_;
                  viewKept = true;
                  if (canceled) {
                    void cancelView();
                  }
                };
                instance.handleCancel((reason) => {
                  canceled = true;
                  cancelReason = reason;
                  if (viewKept) {
                    const cleanup = cancelView();
                    // sync mode would reject a thenable under strict, nobody awaits it there
                    return instance.asyncCancel ? cleanup : undefined;
                  }
                  return undefined;
                });
              }

              // Internal path: stand-in options say true, use the captured value.
              const forceCancelable =
                isInternalSpeciesConstructionWithoutOptions ? internalForceCancelable : (
                  normalizedOptions.forceCancelable
                );
              if (!forceCancelable) {
                instance._internalState = states.FORCE_PENDING;
                if (instance._cancelHandlers) {
                  instance._cancelHandlers = undefined;
                }
                instance._runSettlementEffects();
                if (adopted) {
                  resolve_(adopted);
                } else {
                  // native adoption keeps its job timing, the stand-in spares a second `then` read
                  const then = foreignThen!;
                  const foreign = value;
                  const keep = keepView;
                  resolve_({
                    then:
                      keep ?
                        (onFulfilled, onRejected) => {
                          const view = then.call(foreign, onFulfilled, onRejected);
                          keep(view);
                          return view;
                        }
                      : (onFulfilled, onRejected) => then.call(foreign, onFulfilled, onRejected),
                  } as PromiseLike<TResult>);
                }
                return;
              }

              // one-shot pair, like the resolving functions native resolution hands to `then`
              let adoptionSettled = false;
              const onAdopt = (value_: TResult | PromiseLike<TResult>): void => {
                if (!adoptionSettled) {
                  adoptionSettled = true;
                  adopting = false;
                  // a thenable result is adopted in turn, through the same checks
                  resolve(value_);
                }
              };
              const onAdoptRejected = (reason: unknown): void => {
                if (!adoptionSettled) {
                  adoptionSettled = true;
                  adopting = false;
                  reject(reason);
                }
              };

              adopting = true;
              if (adopted) {
                // Subscribe to the adopted value's settlement.
                // For a cancelable value use
                // the non-counting internal subscription: `_chain` above already raised its
                // consumer count for THIS promise, so awaiting settlement through the counting
                // `.then()` as well would add a phantom consumer that never completes and would
                // keep the adopted promise alive forever.
                adopted._subscribe(onAdopt, onAdoptRejected);
              } else {
                // foreign `then` runs in its own job, the same tick native resolution uses
                const then = foreignThen!;
                const foreign = value;
                const keep = keepView;
                void NativePromise.resolve().then(() => {
                  try {
                    const view: unknown = then.call(foreign, onAdopt, onAdoptRejected);
                    if (keep) {
                      keep(view);
                    }
                  } catch (error) {
                    // ignored once `then` already settled the adoption
                    onAdoptRejected(error);
                  }
                });
              }
            } else if (instance._internalState === states.FORCE_PENDING) {
              // native already adopted and ignores this; other states drop it so a
              // pre-aborted promise cannot fulfill before its deferred rejection lands
              resolve_(value);
            } else if (instance._internalState === states.CANCELED) {
              // a canceled child still runs its callback, nobody reads what it returns
              reclaimOrphanedResult(value, instance._canceledReason);
            }
          }

          function reject(reason?: any): void {
            const state = instance._internalState;
            if (state !== states.PENDING) {
              // FORCE_PENDING passthrough is a native no-op, same as in resolve
              if (state === states.FORCE_PENDING) {
                reject_(reason);
              } else if (state === states.CANCELED && _rejectingCanceled) {
                cancelError = reason;
                reject_(reason);
              }
              return;
            }

            if (adopting) {
              return;
            }

            // Cancellation parity: an external rejection carrying a CancelError
            // transitions the promise to CANCELED exactly like cancel(), and must fire
            // registered cancel handlers + suppress its own unhandled rejection.
            //
            // cancel() sets state CANCELED itself BEFORE calling _reject, so this
            // PENDING->CANCELED branch is skipped on the cancel() path -> handlers fire
            // exactly once (no double-fire).
            // It only triggers for genuinely external
            // CancelError rejections (executor reject / handler throw / adopted thenable).
            const externalCancel = isCancelError(reason);
            instance._internalState = externalCancel ? states.CANCELED : states.REJECTED;
            if (externalCancel) {
              cancelError = reason;
            } else if (instance._cancelHandlers) {
              instance._cancelHandlers = undefined;
            }

            reject_(reason);
            instance._runSettlementEffects();

            if (externalCancel) {
              if (instance === tempThis) {
                // synchronous executor: instance is temp this so defer cancellation side effects
                instance._pendingSyncCancel = true;
                instance._pendingSyncCancelReason = reason as unknown;
              } else {
                try {
                  instance._runCancellation(reason);
                } catch (_e) {
                  // a throw here would escape the native reaction job as uncaught
                }
              }
            }
          }

          let _ac: IAbortControllerLike | undefined;

          function handleCancel(onCancel: TOnCancel): CancelablePromise<TResult, TFailure> {
            return instance.handleCancel(onCancel);
          }

          function getSignal(): IAbortSignal {
            if (!_ac) {
              const ac = new AbortController() as unknown as IAbortControllerLike;
              if (instance.canceled) {
                ac.abort(cancelError);
              } else {
                // a strict throw here leaves no controller, so the next call throws too
                instance.handleCancel(() => ac.abort(cancelError));
              }
              _ac = ac;
            }
            return _ac.signal;
          }

          this._resolve = resolve;
          this._reject = reject;

          // Non-strict pre-aborted signal: the promise is born canceled, so the executor
          // does not run.
          // The deferred rejection is applied to the real instance after
          // Reflect.construct (see the post-construct handoff below), which keeps the live
          // settlement wrappers intact for withResolvers and lets settler-release happen
          // naturally at that later settle.
          if (!hasPendingPreAbort) {
            try {
              executor(resolve, reject, new ExecutorContext<TResult, TFailure>(handleCancel, getSignal));
            } catch (error) {
              // a native catch would bypass the wrappers and leave the state PENDING
              reject(error);
            }
          }
        }) as TPromiseExecutor<TResult>,
      ],
      This,
    ) as CancelablePromise<TResult, TFailure>;

    // Initialize real instance layout explicitly to keep the object lean
    // Reflect.construct returns a different object that never ran initializers
    // Lazily-allocated collections stay absent until first use
    // Only state advanced by synchronous executor is carried over from tempThis
    // Executor never settles synchronously on pre-abort path
    // Wrappers migrated here stay live to preserve settler-release
    instance._resolve = tempThis._resolve;
    instance._reject = tempThis._reject;
    instance._internalState = tempThis._internalState;
    // Cold fields stay on prototype default to avoid useless own properties
    // _cancelHandlers shared by reference between tempThis and instance
    // _pendingSyncCancel(+Reason) carried the same way, transient tempThis-only state
    // Retains any handlers registered synchronously during executor run
    // Changing to blanket Object.assign wastes memory on every promise
    if (tempThis._cancelHandlers) {
      instance._cancelHandlers = tempThis._cancelHandlers;
    }
    if (tempThis._pendingSyncCancel) {
      instance._pendingSyncCancel = true;
      instance._pendingSyncCancelReason = tempThis._pendingSyncCancelReason as unknown;
    }

    // Internal/species construction: the calling `then()` overwrites `_flags` immediately and
    // there is never a signal, so skip the flag unpacking and the signal wiring
    // entirely.
    // Seed `_flags` with the default (forceCancelable) so any flag read before `then`
    // assigns is still well-defined.
    if (isInternalSpeciesConstructionWithoutOptions) {
      instance._flags = FLAG_FORCE_CANCELABLE;
      return instance;
    }

    // Packed flag options (one int instead of five boolean own-properties).
    let flags = 0;
    if (normalizedOptions.asyncCancel) flags |= FLAG_ASYNC_CANCEL;
    if (normalizedOptions.forceCancelable) flags |= FLAG_FORCE_CANCELABLE;
    if (normalizedOptions.bubble) flags |= FLAG_BUBBLE;
    if (normalizedOptions.strict) flags |= FLAG_STRICT;
    if (normalizedOptions.shield) flags |= FLAG_SHIELD;
    instance._flags = flags;
    if (tempThis._cancelHandlers) {
      // a bubble handler chained during the executor reads the cancel mode off the temp this
      tempThis._flags = flags;
    }

    const { signal } = normalizedOptions;

    // pre-aborted signals are handled by deferred handoff so no listeners are wired
    // sync-settled: cleanup already ran, a listener added now would leak
    if (signal && !hasPendingPreAbort && instance._internalState === states.PENDING) {
      // Support both single signal and array of signals.
      const signals = Array.isArray(signal) ? signal : [signal];

      const cancelFromSignal = (reason: unknown): void => {
        try {
          instance.cancel(reason);
        } catch (_e) {
          // abort dispatch has no caller to catch this, a throw would surface as uncaught
        }
      };

      // the executor may have aborted a signal itself, after the pre-check ran
      const abortedDuringExecutor = signals.find((s) => s.aborted);
      if (abortedDuringExecutor) {
        cancelFromSignal(abortedDuringExecutor.reason);
      } else {
        // register abort listeners for signals; tracking structures allocated lazily
        const abortSignals: IAbortSignal[] = (instance._abortSignals = []);
        const abortListeners = (instance._abortListeners = new Map<IAbortSignal, any>());
        for (const sig of signals) {
          const onAbort = () => {
            cancelFromSignal(sig.reason);
          };

          abortSignals.push(sig);
          abortListeners.set(sig, onAbort);
          sig.addEventListener('abort', onAbort, { once: true });
        }
      }
    }

    // Deferred pre-aborted-signal handoff.
    // The executor was skipped, so the promise is born
    // pending.
    // Mark it CANCELED synchronously (so `canceled`/`cancelable` observe the final
    // state in the same tick as construction, matching the previous behavior) and retain the
    // reason for late immediate handlers, but defer the native-promise rejection + unhandled-
    // suppression to a microtask.
    // Deferring lets the constructor return with the live `_resolve`/
    // `_reject` wrappers still attached, so `withResolvers` hands out usable settlers before
    // settlement nulls them; the extra microtask only delays the `.catch`/`await` rejection, which
    // the pre-abort specs already tolerate (they assert the reason after a macrotask flush).
    if (hasPendingPreAbort) {
      const preAbortError = toCancelError(pendingPreAbortReason);
      instance._internalState = states.CANCELED;
      instance._canceledReason = pendingPreAbortReason;
      instance._isCanceledReasonSet = true;
      const settle = instance._reject;
      void NativePromise.resolve().then(() => {
        // same steps as cancel(): native reject, settle effects, cascade
        rejectCanceled(settle, preAbortError);
        instance._runSettlementEffects();
        try {
          instance._runCancellation(pendingPreAbortReason);
        } catch (_e) {
          // no caller to receive a handler error
        }
      });
    }

    // Run cancellation side effects deferred from a synchronous external CancelError
    // rejection (temp-`this` gotcha): now that `instance` is the real promise, suppress the
    // rejection and fire cancel handlers.
    // Skipped for internal derived-promise construction
    // (species via then), which never carry a deferred external cancel.
    if (instance._pendingSyncCancel && !This._pendingInternalCall) {
      instance._pendingSyncCancel = false;
      const reason = instance._pendingSyncCancelReason as unknown;
      instance._pendingSyncCancelReason = undefined;
      try {
        instance._runCancellation(reason);
      } catch (_e) {
        // the executor's reject call already returned, nobody receives a handler error
      }
    }

    return instance;
  }

  // Flag accessors backed by the packed `_flags` int (see the memory notes on the field block).
  // Getters/setters keep the public boolean read/write API identical to the former own-property
  // fields while storing all five flags in a single integer.
  get asyncCancel(): boolean {
    return (this._flags & FLAG_ASYNC_CANCEL) !== 0;
  }
  /** @deprecated Pass the option at construction. */
  set asyncCancel(v: boolean) {
    this._setFlag(FLAG_ASYNC_CANCEL, v);
  }
  get forceCancelable(): boolean {
    return (this._flags & FLAG_FORCE_CANCELABLE) !== 0;
  }
  /** @deprecated Pass the option at construction. */
  set forceCancelable(v: boolean) {
    this._setFlag(FLAG_FORCE_CANCELABLE, v);
  }
  get bubble(): boolean {
    return (this._flags & FLAG_BUBBLE) !== 0;
  }
  /** @deprecated Pass the option at construction. */
  set bubble(v: boolean) {
    this._setFlag(FLAG_BUBBLE, v);
  }
  get strict(): boolean {
    return (this._flags & FLAG_STRICT) !== 0;
  }
  /** @deprecated Pass the option at construction. */
  set strict(v: boolean) {
    this._setFlag(FLAG_STRICT, v);
  }
  get shield(): boolean {
    return (this._flags & FLAG_SHIELD) !== 0;
  }
  /** @deprecated Pass the option at construction. */
  set shield(v: boolean) {
    this._setFlag(FLAG_SHIELD, v);
  }

  private _setFlag(bit: number, value: boolean): void {
    if (value) {
      this._flags |= bit;
    } else {
      this._flags &= ~bit;
    }
  }

  get canceled(): boolean {
    return this._internalState === states.CANCELED;
  }

  /** @deprecated use `canceled` */
  get isCanceled(): boolean {
    return this.canceled;
  }

  get cancelable(): boolean {
    // Settled-ness is derived purely from the internal state machine now.
    // A promise is
    // cancelable only while genuinely PENDING; FORCE_PENDING (forceCancelable:false adoption),
    // FULFILLED, REJECTED and CANCELED are all non-cancelable.
    return this._internalState === states.PENDING;
  }

  /** @deprecated use `cancelable` */
  get isCancelable(): boolean {
    return this.cancelable;
  }

  /**
   * Snapshot of this promise's active cancellation options (flags + signal not included,
   * those are one-shot constructor inputs, not ongoing state).
   */
  get options(): Required<ICancelablePromiseFlagOptions> {
    return {
      asyncCancel: this.asyncCancel,
      forceCancelable: this.forceCancelable,
      bubble: this.bubble,
      strict: this.strict,
      shield: this.shield,
    };
  }

  /**
   * Attaches callbacks for the resolution and/or rejection of the Promise.
   *
   * If a callback returns a CancelablePromise, that returned promise is adopted and linked into
   * the chain graph as a counted parent, the same as a declared parent: canceling the promise
   * returned by this call reaches the adopted promise once every counted consumer is gone and its
   * value is unconsumed, honoring the adopted promise's own `bubble`/`shield` options. A callback
   * that returns a plain native promise is not linked this way; that stays a cancellation gap.
   * @param onFulfilled The callback to execute when the Promise is resolved.
   * @param onRejected The callback to execute when the Promise is rejected.
   * @returns A Promise for the completion of which ever callback is executed.
   */
  then<TResult1 extends PromiseLike<never>, TResult2 extends PromiseLike<never>>(
    onFulfilled: (value: TResult) => TResult1,
    onRejected: (reason: TReason<TFailure>) => TResult2,
  ): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>;
  then<TResult1 extends PromiseLike<never>, TResult2 = never>(
    onFulfilled: (value: TResult) => TResult1,
    onRejected: (reason: TReason<TFailure>) => TResult2,
  ): CancelablePromise<
    Awaited<TResult1 | TResult2>,
    FailureOf<TResult1> | FailureOf<TResult2> | ([TResult2] extends [never] ? TFailure : never)
  >;
  then<TResult1 extends PromiseLike<never>, TResult2 = never>(
    onFulfilled: (value: TResult) => TResult1,
    onRejected?: ((reason: TReason<TFailure>) => TResult2) | null,
  ): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2> | TFailure>;
  then<TResult1 = TResult, TResult2 extends PromiseLike<never> = never>(
    onFulfilled: ((value: TResult) => TResult1) | null | undefined,
    onRejected: (reason: TReason<TFailure>) => TResult2,
  ): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2>>;
  then<TResult1 = TResult, TResult2 = never>(
    onFulfilled: ((value: TResult) => TResult1) | null | undefined,
    onRejected: (reason: TReason<TFailure>) => TResult2,
  ): CancelablePromise<
    Awaited<TResult1 | TResult2>,
    FailureOf<TResult1> | FailureOf<TResult2> | ([TResult2] extends [never] ? TFailure : never)
  >;
  then<TResult1 = TResult, TResult2 = never>(
    onFulfilled?: ((value: TResult) => TResult1) | null,
    onRejected?: ((reason: TReason<TFailure>) => TResult2) | null,
  ): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2> | TFailure>;
  then<TResult1 = TResult, TResult2 = never>(
    onFulfilled?: ((value: TResult) => TResult1) | null,
    onRejected?: ((reason: TReason<TFailure>) => TResult2) | null,
  ): CancelablePromise<Awaited<TResult1 | TResult2>, FailureOf<TResult1> | FailureOf<TResult2> | TFailure> {
    // `_then` runs native then() through the species machinery, so its result is already a
    // CancelablePromise of the right (possibly subclass) constructor.
    // The derived child inherits
    // this promise's flags except `shield` (per-node, never inherited).
    // Rather than round-trip
    // through `_getOptions` + `resolve` (which rebuilt an options object and then reconstructed
    // the promise whenever the parent's flags differed from the fresh default), copy the packed
    // flags straight across as a single integer and clear the shield bit.
    // Behaviorally identical
    // to the old resolve-reconstruct path, minus the per-call allocation and comparison.
    const promise = this._then(onFulfilled, onRejected);
    promise._flags = this._flags & ~FLAG_SHIELD;

    this._chain(promise);

    return promise;
  }

  /**
   * Attaches a callback for only the rejection of the Promise.
   * @param onRejected The callback to execute when the Promise is rejected.
   * @returns A Promise for the completion of the callback.
   */
  catch<R extends PromiseLike<never>>(
    onRejected: (reason: TReason<TFailure>) => R,
  ): CancelablePromise<Awaited<TResult | R>, FailureOf<R> | ([R] extends [never] ? TFailure : never)>;
  catch<R = never>(onRejected: (reason: TReason<TFailure>) => R): CancelablePromise<Awaited<TResult | R>, FailureOf<R>>;
  catch<R = never>(
    onRejected?: ((reason: TReason<TFailure>) => R) | null,
  ): CancelablePromise<Awaited<TResult | R>, FailureOf<R> | TFailure>;
  catch<R = never>(
    onRejected?: ((reason: TReason<TFailure>) => R) | null,
  ): CancelablePromise<Awaited<TResult | R>, FailureOf<R> | TFailure> {
    // conditional types over still-generic R/TResult do not collapse to catch's own signature
    return this.then(null, onRejected) as unknown as CancelablePromise<Awaited<TResult | R>, FailureOf<R> | TFailure>;
  }

  /**
   * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
   * resolved value cannot be modified from the callback.
   *
   * If `onFinally` returns a CancelablePromise, that cleanup is shielded: canceling the promise
   * returned by this call never cancels it. A cancel that arrives while the cleanup runs takes
   * effect once the cleanup settles, so the returned promise rejects with a CancelError only after
   * its cleanup is done. A cleanup that rejects wins over that cancel.
   *
   * While the cleanup runs, `isCanceled` stays false and the promise `cancel()` returned stays
   * pending until the cleanup settles. A cleanup that never settles keeps both the returned promise
   * and the `cancel()` promise pending, so a hung cleanup hangs them.
   * @param onFinally The callback to execute when the Promise is settled (fulfilled or rejected).
   * @returns A Promise for the completion of the callback.
   */
  finally(onFinally?: (() => void | PromiseLike<unknown>) | null): CancelablePromise<TResult, TFailure> {
    if (typeof onFinally === 'function') {
      const This = this.constructor as typeof CancelablePromise;

      const afterCleanup = (settle: () => unknown): unknown => {
        const cleanup = onFinally();
        if (!isCancPromise(cleanup)) {
          return This.resolve(cleanup).then(settle);
        }

        const drain: ICleanupDrain = { canceled: false };
        const holder = child as unknown as IDrainHolder;
        holder._cleanupDrain = drain;
        return This.resolve(cleanup, { shield: true }).then(
          () => {
            holder._cleanupDrain = undefined;
            if (!drain.canceled) {
              return settle();
            }
            try {
              child._cancel(drain.reason, drain.disposing, drain.collector);
            } catch (_e) {
              // the cancel() call that asked for it has already returned
            }
            if (drain.release) {
              drain.release();
            }
            return undefined;
          },
          (error: unknown) => {
            holder._cleanupDrain = undefined;
            if (drain.release) {
              drain.release();
            }
            throw error;
          },
        );
      };

      // Same generic-collapse gap as catch(): `This` is the generic-erased `typeof
      // CancelablePromise`, so the chained `.then()`s can't correlate back to this promise's own
      // TResult/TFailure, and the general `then` overload's FailureOf<TResult1>/TResult2-fallback
      // terms don't provably vanish even though onFinally never changes the settlement value or
      // reason.
      // Narrowing to finally()'s own declared signature is a boundary cast.
      const child = this.then(
        (value: TResult) => afterCleanup(() => value),
        (reason: TReason<TFailure>) =>
          afterCleanup(() => {
            throw reason;
          }),
      ) as unknown as CancelablePromise<TResult, TFailure>;
      return child;
    } else {
      return this.then(null, null) as unknown as CancelablePromise<TResult, TFailure>;
    }
  }

  handleCancel(onCancel: TOnCancel, options?: IHandleCancelOptions): CancelablePromise<TResult, TFailure> {
    if (this.cancelable) {
      if (isFunction(onCancel)) {
        // allocate handlers array lazily on first registration to save memory
        const handlers = this._cancelHandlers || (this._cancelHandlers = []);
        if (!handlers.includes(onCancel)) {
          handlers.push(onCancel);
        }
      }
    } else if (options && options.immediate && this.canceled) {
      // Immediate opt-in: the promise is already canceled, fire the handler
      // asynchronously (microtask) with the original cancel reason instead of a silent no-op.
      // This also suppresses the strict throw for this call.
      if (isFunction(onCancel)) {
        const reason = this._isCanceledReasonSet ? this._canceledReason : undefined;

        void NativePromise.resolve().then(() => {
          onCancel(reason);
        });
      }
    } else if (this.strict) {
      throw new Error(`${this.canceled ? 'Canceled' : 'Settled'} promise cannot add cancel handler`);
    }

    return this;
  }

  /**
   * Cancels a pending promise, rejecting it with a {@link CancelError}.
   *
   * The reason is normalized: a {@link CancelError} passes through unchanged; any other
   * object becomes the `cause` of a fresh {@link CancelError}; a string/undefined becomes its
   * message. Registered cancel handlers still receive the original `reason`.
   *
   * Return contract: in awaitable cancel mode (`asyncCancel`, the default) every call returns a
   * promise. It settles once all cancel handlers in the entire cancellation cascade have settled,
   * including handlers registered on ancestor promises reached by bubble propagation and on race
   * inputs canceled after the race settles. An explicit `await cancel()` therefore postpones until
   * the complete cleanup is done, not just the local handlers. A second call while that cleanup
   * runs returns a promise for the same cleanup. A call made while another cancel is running (from
   * a cancel handler, for example) adds its cleanup to that cancel and returns a promise for its
   * own part. On a settled or shielded promise the returned promise resolves with an empty list.
   * In non-awaitable mode (`asyncCancel:false`) handlers run synchronously and `cancel()` returns
   * `undefined`; a handler that returns a thenable in this mode throws under `strict` (the handler
   * needs async cleanup but the caller opted out of awaiting it). A throwing handler does not stop
   * the others: all of them run, then this call rethrows the first error. A cancel reached any
   * other way (abort signal, bubble, a canceled parent) drops handler errors.
   *
   * Handler timing: registered cancel handlers START synchronously the moment the cancel takes
   * effect, regardless of what triggered it (an explicit `cancel()`, an upstream rejection, or a
   * bubble from settled children). What a handler returns is still awaited asynchronously by the
   * returned settlement promise; only the invocation is synchronous.
   *
   * Bubble timing: this promise is canceled at once, but a parent that loses its last consumer is
   * canceled two microtasks later, after counting its consumers again. A consumer subscribed
   * anywhere in the current synchronous turn, canc or native (`await`, `Promise.resolve`), keeps
   * the parent alive. Above that parent the cascade runs synchronously.
   *
   * On an already-settled/canceled promise the cancel itself is a silent no-op unless `strict`,
   * which throws.
   * @param reason The cancellation reason.
   */
  cancel(reason?: any, _disposing?: boolean): void | CancelablePromise<ISettledResult<unknown>[], never> {
    const awaitable = this.asyncCancel;
    const live = this.cancelable && !this.shield;
    // a cancel already running collects this one too, so the cascade shares one collector
    const outer = _activeCollector;
    const start = outer ? outer.length : 0;
    const collector = outer || (live && awaitable ? [] : undefined);

    this._cancel(reason, _disposing, collector);

    if (!awaitable) {
      return;
    }

    const This = this.constructor as typeof CancelablePromise;
    if (live) {
      return settleCleanup(This, outer ? outer.slice(start) : collector!, () => {
        this._collector = undefined;
      });
    }

    const running = this.canceled ? this._collector : undefined;
    return running ? settleCleanup(This, running) : This.resolve([]);
  }

  /**
   * Protected cancel implementation. All cancel logic lives here; `cancel()` is a thin wrapper
   * that decides whether to allocate a collector (initiator) or thread an existing one (cascade).
   */
  protected _cancel(reason?: any, disposing?: boolean, collector?: any[]): void {
    if (this.shield && this.cancelable) {
      if (this.strict && !disposing) {
        throw new Error('Shielded promise cannot be canceled');
      }
      return;
    }

    if (this.cancelable) {
      const drain = (this as unknown as IDrainHolder)._cleanupDrain;
      if (drain) {
        // the cleanup onFinally returned runs to the end, the cancel lands after it
        if (!drain.canceled) {
          drain.canceled = true;
          drain.reason = reason;
          drain.disposing = disposing;
        }
        if (collector) {
          if (!drain.collector) {
            drain.collector = collector;
          }
          collector.push(
            drain.done ||
              (drain.done = new NativePromise<void>((resolve) => {
                drain.release = resolve;
              })),
          );
        }
        return;
      }

      this._internalState = states.CANCELED;

      const error = toCancelError(reason);

      if (disposing) {
        error.disposed = true;
      }

      rejectCanceled(this._reject, error);
      this._runSettlementEffects();

      // Store collector on instance for async bubbles (.then()-based bubbleOnComplete)
      // to read after the synchronous _activeCollector has been restored.
      if (collector) this._collector = collector;

      const prev = _activeCollector;
      if (collector) _activeCollector = collector;
      try {
        this._runCancellation(reason, collector);
      } finally {
        _activeCollector = prev;
      }
    } else if (this.strict && !disposing) {
      throw new Error(`${this.canceled ? 'Canceled' : 'Settled'} promise cannot be canceled`);
    }
  }

  /**
   * Returns a `cancel` bound to this instance for the detached call site (`withResolvers().cancel`)
   * that hands the function out on its own. The bound copy is created on demand
   * and cached as an own property so every promise no longer pays for a per-instance bound `cancel`;
   * the normal `p.cancel(...)` method call stays prototype-dispatched and allocates nothing.
   */
  protected _getBoundCancel(): CancelablePromise<TResult, TFailure>['cancel'] {
    let bound = this._boundCancel;
    if (!bound) {
      bound = this._boundCancel = this.cancel.bind(this);
    }
    return bound;
  }

  /**
   * Explicit-resource-management disposal, shared by [Symbol.dispose] and [Symbol.asyncDispose].
   * An internal NO-THROW cancel: it bypasses `strict` (dispose-after-settle and shielded disposal
   * are both normal, expected no-ops, never errors) and cancels a genuinely pending, non-shielded
   * promise with a dispose-marked CancelError.
   *
   * @returns The handler-settlement promise in asyncCancel mode (so `[Symbol.asyncDispose]` and
   * `await using` can await cleanup); otherwise undefined.
   */
  protected _dispose(): void | CancelablePromise<ISettledResult<unknown>[], never> {
    // Route through the instance's (possibly overridden) cancel so subclasses like the coroutine
    // finally-drain govern disposal too. `_disposing` suppresses the strict throw and marks the
    // CancelError as disposed; shielded / already-settled promises no-op inside cancel().
    return this.cancel('Disposed', true);
  }

  /**
   * Cancellation side effects shared by cancel() and the external-CancelError reject path:
   * suppresses the promise's own unhandled rejection and fires registered cancel handlers.
   * State (CANCELED) must already be set by the caller.
   *
   * When a `collector` array is provided (from the initiator's cancel()), handler promises are
   * pushed into it instead of building a local allSettled. The initiator wraps the collector in
   * one top-level allSettled that covers the entire transitive cancel cascade. Without a collector,
   * handlers fire-and-forget (bubble/external-cancel paths).
   *
   * In non-awaitable mode every handler runs even when one throws; the first error is rethrown
   * after the last handler. Only a direct `cancel()` call lets it reach a caller, every other
   * path drops it.
   */
  protected _runCancellation(reason?: any, collector?: any[]): void {
    this._canceledReason = reason;
    this._isCanceledReasonSet = true;

    const queue = _queueHandlers;
    _queueHandlers = false;

    this._then(undefined, noop);

    const handlers = this._cancelHandlers;
    if (!handlers || handlers.length === 0) {
      return;
    }

    if (queue) {
      _cancelFrames.push({ promise: this, handlers: handlers.slice(), next: 0, reason, collector: collector! });
      handlers.length = 0;
      return;
    }

    const inFrameHandler = _inFrameHandler;
    _inFrameHandler = false;
    try {
      if (this.asyncCancel) {
        if (collector) {
          const This = this.constructor as typeof CancelablePromise;
          for (const handler of handlers) {
            collector.push(new This((resolve) => resolve(handler(reason))));
          }
          handlers.length = 0;
          return;
        }

        // Fire-and-forget (no collector): bubble/external-cancel cascade.
        const pending = handlers.slice();
        handlers.length = 0;
        for (const handler of pending) {
          try {
            const r = handler(reason);
            if (isThenable(r)) {
              (r as PromiseLike<unknown>).then(noop, noop);
            }
          } catch (_e) {
            /**/
          }
        }
      } else {
        const pending = handlers.slice();
        handlers.length = 0;
        let failed = false;
        let firstError: unknown;
        for (const handler of pending) {
          try {
            const r = handler(reason);
            if (isThenable(r)) {
              if (this.strict) {
                throw new Error(
                  'Cancel handler returned a thenable in non-awaitable cancel mode. Use asyncCancel:true or make the handler synchronous',
                );
              }
              (r as PromiseLike<unknown>).then(noop, noop);
            }
          } catch (error) {
            if (!failed) {
              failed = true;
              firstError = error;
            }
          }
        }
        if (failed) {
          throw firstError;
        }
      }
    } finally {
      _inFrameHandler = inFrameHandler;
    }
  }

  /**
   * Settlement side effects run whenever the promise settles (any way: FULFILLED, REJECTED, CANCELED).
   * Currently: clean up abort-signal listeners to prevent unbounded listener accumulation.
   */
  protected _runSettlementEffects(): void {
    // release settlement wrappers once settled to free closed-over executor scope
    // `withResolvers` already captured its own references at construction time, so nulling
    // the fields here does not affect callers still holding the functions.
    this._resolve = undefined as any;
    this._reject = undefined as any;

    // Remove all registered abort listeners to prevent listener leaks when a promise settles
    // before its signal(s) abort.
    // Both structures are absent unless a signal was wired, so the
    // common (no-signal) path does nothing here.
    const abortSignals = this._abortSignals;
    if (abortSignals) {
      const abortListeners = this._abortListeners!;
      for (const signal of abortSignals) {
        const listener = abortListeners.get(signal);
        if (listener) {
          signal.removeEventListener('abort', listener, { once: true });
          abortListeners.delete(signal);
        }
      }
      abortSignals.length = 0;
    }
  }

  protected _then<TResult1 = TResult, TResult2 = never>(
    onFulfilled?: ((value: TResult) => TResult1) | null,
    onRejected?: ((reason: TReason<TFailure>) => TResult2) | null,
  ): CancelablePromise<
    Awaited<TResult1 | TResult2>,
    FailureOf<TResult1> | FailureOf<TResult2> | ([TResult2] extends [never] ? TFailure : never)
  > {
    const This = this.constructor as typeof CancelablePromise;
    // a then called from a subclass constructor or species getter must not leak into this child
    const outerForceCancelable = _thenChildForceCancelable;
    _thenChildForceCancelable = (this._flags & FLAG_FORCE_CANCELABLE) !== 0;
    // Calls CancelablePromise constructor internally
    try {
      if (OWN_THEN_CHILD) return thenWithOwnChild(this, onFulfilled, onRejected);
      This._pendingInternalCall = true;
      // Cast return from native prototype.then which returns a CancelablePromise at runtime
      // via species construction but is typed as plain Promise by standard lib
      return NativePromise.prototype.then.call(this, onFulfilled, onRejected) as unknown as CancelablePromise<
        Awaited<TResult1 | TResult2>,
        FailureOf<TResult1> | FailureOf<TResult2> | ([TResult2] extends [never] ? TFailure : never)
      >;
    } finally {
      This._pendingInternalCall = false;
      _thenChildForceCancelable = outerForceCancelable;
    }
  }

  /**
   * Bubble-count core shared by `_chain` and `_retainRef`. While this promise is cancelable, raise
   * its chain count by one and return the matching `onComplete` completion callback; the caller
   * decides how that completion is wired (a child's `handleCancel`, a settle reaction, or a native
   * subscription). Returns `undefined` once this promise is no longer cancelable, so the caller
   * skips wiring entirely. Every edge is counted, whatever `bubble` is. The value of `bubble` when
   * the edge is created decides whether its completion may bubble: an edge created with `bubble`
   * off never triggers the bubble, and while it is open it keeps the other edges from triggering it.
   *
   * On each completion increment `_completedChainsCount`. Once every counted ref has completed,
   * through a cancel or, for `bubbleOnComplete` (race), through the child settling, the bubble is
   * decided two microtasks later: a consumer subscribed in the meantime (a canc `then`, or a native
   * `await` / `Promise.resolve` that subscribes one job late) keeps this promise alive. A settle
   * waits one microtask more, since a native `await` of the settled race resumes a job after the
   * settle reaction that completes the ref. Otherwise
   * it is bubble-canceled with a `bubbled` CancelError, and the cascade above it runs synchronously
   * inside that job. The deferred job joins the active cleanup collector, so an awaited `cancel()`
   * of the child also waits for this cleanup.
   */
  protected _addChainRef(bubbleOnComplete?: boolean): (() => void) | undefined {
    if (!this.cancelable) {
      return undefined;
    }

    // an edge created with bubble off never bubbles, but its open ref holds the others back
    const bubbles = this.bubble;
    this._chainsCount++;

    return () => {
      this._completedChainsCount++;

      if (!bubbles || this._completedChainsCount < this._chainsCount || !this.cancelable) {
        return;
      }

      const bubbleCancel = (collector: any[] | undefined): void => {
        const error = new CancelError(`Bubbled on ${bubbleOnComplete ? 'settling' : 'cancel'}`);
        error.bubbled = true;

        try {
          if (this.cancel === CancelablePromise.prototype.cancel) {
            _queueHandlers = _inFrameHandler;
            // the running cancel already collects this cleanup, its result would go unread
            this._cancel(error, undefined, collector);
          } else {
            this.cancel(error);
          }
        } catch (_e) {
          // a parent's handler error never reaches the child's canceler
        } finally {
          _queueHandlers = false;
        }
        _deferredCanceled!.push(this);
      };

      const collector = _activeCollector;
      if (_inDeferredBubble) {
        bubbleCancel(collector);
        return;
      }

      // two jobs: every native adoption form subscribes within one job of this turn
      let turnEnd = NativePromise.resolve().then(noop);
      if (bubbleOnComplete) {
        // a native await of the settled race resumes one job after this reaction
        turnEnd = turnEnd.then(noop);
      }
      const hop = turnEnd.then(() => {
        if (this._completedChainsCount < this._chainsCount || !this.cancelable) {
          return new DeferredCleanup([]);
        }
        // own collector: entries appended to the caller's one would cost it another round
        const own: any[] = [];
        const canceled: CancelablePromise<any, any>[] = [];
        const prevCollector = _activeCollector;
        _activeCollector = own;
        _deferredCanceled = canceled;
        _inDeferredBubble = true;
        _inFrameHandler = true;
        try {
          bubbleCancel(own);
          runCancelFrames();
        } finally {
          _cancelFrames.length = 0;
          _inFrameHandler = false;
          _inDeferredBubble = false;
          _deferredCanceled = undefined;
          _activeCollector = prevCollector;
        }
        return settleDeferredCleanup(own, () => {
          for (const promise of canceled) {
            if (promise._collector === own) {
              promise._collector = undefined;
            }
          }
        });
      });
      if (collector) {
        collector.push(hop);
      }
    };
  }

  /**
   * Counted consumer ref without a child promise: raises the chain count once and returns the
   * function that completes it, or `undefined` once this promise is no longer cancelable. Releasing
   * twice completes the ref once. When the release drops the last consumer, this promise is
   * bubble-canceled on the same schedule as `_chain`; `settleTiming` picks the later race timing.
   *
   * @internal
   */
  // cross-copy contract: fixed meaning, an incompatible change takes a new suffixed name
  protected _retainRef(settleTiming?: boolean): (() => void) | undefined {
    const onComplete = this._addChainRef(settleTiming);
    if (!onComplete) {
      return undefined;
    }
    let released = false;
    return () => {
      if (!released) {
        released = true;
        onComplete();
      }
    };
  }

  /**
   * Internal settlement subscription: attach `onFulfilled`/`onRejected` reactions to this promise
   * WITHOUT constructing a derived CancelablePromise. `NativePromise.prototype.then.call` is used
   * with the species machinery NOT engaged (`_pendingInternalCall` stays false), so `new.target`
   * inside the native then resolves to the native Promise constructor and the returned object is a
   * plain native promise, never a canc species. The reactions still run at A+ timing and, because a
   * rejection reaction is attached, this source counts as handled for the host (no unhandled
   * rejection), exactly like the per-item `.then()` it replaces. The throwaway native promise is
   * never returned to a caller nor chained.
   */
  // cross-copy contract: fixed meaning, an incompatible change takes a new suffixed name
  protected _subscribe(
    onFulfilled?: ((value: TResult) => any) | null,
    onRejected?: ((reason: any) => any) | null,
  ): void {
    void NativePromise.prototype.then.call(this, onFulfilled as any, onRejected as any);
  }

  /**
   * Connects the current and the next promise in the chain and propagates the cancellation to the parent promises
   * @param childPromise The next promise in the chain
   * @param bubbleOnComplete Makes the cancellation bubble on completion of the child promise, e.g. race()
   */
  // cross-copy contract: fixed meaning, an incompatible change takes a new suffixed name
  protected _chain(childPromise: CancelablePromise<any, any>, bubbleOnComplete?: boolean): void {
    const onComplete = this._addChainRef(bubbleOnComplete);
    if (!onComplete) {
      return;
    }

    if (bubbleOnComplete) {
      // Async bubble (race/combinator settle): restore the child's collector into
      // _activeCollector before firing onComplete so the parent's cascade joins the
      // same collector batch.
      // Without this, the async .then() fires on a later microtask
      // when _activeCollector has already been cleared.
      const onSettled = () => {
        const prev = _activeCollector;
        _activeCollector = (childPromise as any)._collector;
        try {
          onComplete();
        } finally {
          _activeCollector = prev;
        }
      };
      childPromise.then(onSettled, onSettled);
    } else if (isThisCopy(childPromise)) {
      childPromise.handleCancel(onComplete);
    } else {
      // a child of another package copy collects what its handler returns, hand it this cleanup
      childPromise.handleCancel(() => {
        // the other copy's collector is out of reach, the deferred bubble joins a local one
        const collector: any[] = [];
        const prev = _activeCollector;
        _activeCollector = collector;
        try {
          onComplete();
        } finally {
          _activeCollector = prev;
        }
        if (!childPromise.asyncCancel) {
          return undefined;
        }
        const running =
          collector.length ? collector
          : this.canceled ? this._collector
          : undefined;
        return running ? settleCleanup(this.constructor as typeof CancelablePromise, running) : undefined;
      });
    }
  }
}

// Capture Promise at module load to survive late environment patches
// Live global lookups would make behavior depend on unpredictable load order
// Tests enforce zero global Promise access after this capture
// Changing this breaks deterministic execution when zone.js patches globals
const NativePromise = Promise;

// a then with a shared noop executor (zone.js, es6-promise) bypasses the child's wrappers
const OWN_THEN_CHILD = thenSkipsChildExecutor(NativePromise);

// Wire into Promise prototype chain without class extends or super
// Object.setPrototypeOf reproduces the two links extends would have wired
// Constructor chain inherits native static fallbacks and Symbol.species getter
// Prototype chain inherits toString and ensures instances duck-check as Promises
// Links point to captured NativePromise to avoid live global dependency
// Changing this breaks species resolution and the Promise duck-check on instances
Object.setPrototypeOf(CancelablePromise, NativePromise);

Object.setPrototypeOf(CancelablePromise.prototype, NativePromise.prototype);

// Duck-token brand: every instance (via the prototype) carries CANCEL_PROMISE_BRAND, so
// isCancPromise (helpers.ts) can identify a genuine canc CancelablePromise across realms/copies
// without `instanceof` (which fails across dual-package-hazard copies of this module).
Object.defineProperty(CancelablePromise.prototype, CANCEL_PROMISE_BRAND, {
  configurable: false,
  enumerable: false,
  writable: false,
  value: true,
});

// Prototype defaults for the cold per-instance fields.
// Declaring these on the prototype (rather
// than initializing them in every constructor) means a promise that never chains, cancels, or takes
// the sync-cancel handoff carries none of them as own properties: reads fall
// through to these shared
// defaults and a write (e.g. `_chainsCount++`) materializes an own property only for the promises
// that actually diverge.
// This is the bulk of the per-instance shrink for the common resolved/
// rejected promise.
// Kept non-enumerable so it does not affect key enumeration
// / the `options` shape.
Object.defineProperties(CancelablePromise.prototype, {
  _chainsCount: { value: 0, writable: true, enumerable: false, configurable: true },
  _completedChainsCount: { value: 0, writable: true, enumerable: false, configurable: true },
  _pendingSyncCancel: { value: false, writable: true, enumerable: false, configurable: true },
  _pendingSyncCancelReason: { value: undefined, writable: true, enumerable: false, configurable: true },
  _canceledReason: { value: undefined, writable: true, enumerable: false, configurable: true },
  _isCanceledReasonSet: { value: false, writable: true, enumerable: false, configurable: true },
});

// Explicit Resource Management wiring.
// Feature-detected and attached at module load so there
// is ZERO footprint on runtimes without the symbols (es5/legacy engines): the prototype simply
// lacks the methods, `using`/`await using` isn't available there anyway, and the type-only fields
// keep the public surface stable. `_dispose` is the internal no-throw cancel (bypasses strict).
const SymbolDispose: symbol | undefined = (Symbol as any).dispose;
const SymbolAsyncDispose: symbol | undefined = (Symbol as any).asyncDispose;

if (typeof SymbolDispose === 'symbol') {
  // synchronous disposal: fire-and-forget cancel returning undefined
  Object.defineProperty(CancelablePromise.prototype, SymbolDispose, {
    configurable: true,
    writable: true,
    value: function (this: CancelablePromise<any, any>): void {
      (this as any)._dispose();
    },
  });
}

if (typeof SymbolAsyncDispose === 'symbol') {
  // Async disposal: returns the handler-settlement promise so `await using` awaits cleanup.
  Object.defineProperty(CancelablePromise.prototype, SymbolAsyncDispose, {
    configurable: true,
    writable: true,
    value: function (this: CancelablePromise<any, any>): PromiseLike<unknown> {
      const result = (this as any)._dispose();
      // normalize undefined return to resolved promise so await using never throws
      return result || NativePromise.resolve([]);
    },
  });
}

export { CancelablePromise };
