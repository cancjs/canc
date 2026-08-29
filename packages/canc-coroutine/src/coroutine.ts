import {
  AggregateError,
  CancelablePromise,
  CancelError,
  Failing,
  FailureOf,
  ICancelablePromiseOptions,
  isCancelError,
} from '@cancjs/promise';

import {
  copyFunctionMetadata,
  IFn,
  isFunction,
  isGenerator,
  isObject,
  isThenable,
  IterationError,
  setFnName,
} from '../../_util';

export type TGeneratorLike<PYield = unknown, PReturn = any, PNext = unknown> = Omit<
  Generator<PYield, PReturn, PNext>,
  typeof Symbol.iterator
>;

// Brand for BreakError, mirroring CancelError's Symbol.for approach: detection keys on the brand,
// not on `name`, so it survives realm boundaries and duplicated package copies.
const BREAK_ERROR_BRAND = Symbol.for('@cancjs/coroutine:BreakError');

/**
 * Error signaling clean early termination of a `cancForAwait` loop.
 *
 * Throwing `BreakError` stops iteration immediately and runs source cleanup without rejecting the
 * outer coroutine.
 */
export class BreakError extends Error {
  declare readonly [BREAK_ERROR_BRAND]: true;
  declare name: 'BreakError';

  constructor(message = '') {
    super(message);

    Object.setPrototypeOf(this, new.target.prototype);

    this.name = 'BreakError';
  }
}

// Brand on the prototype rather than per instance, same rationale as CancelError: the lookup still
// resolves through the prototype chain and no instance carries an own symbol property.
Object.defineProperty(BreakError.prototype, BREAK_ERROR_BRAND, { value: true });

/**
 * Returns true if the given value is a `BreakError`.
 */
export function isBreakError(value: unknown): value is BreakError {
  return isObject(value) && (value as Record<symbol, unknown>)[BREAK_ERROR_BRAND] === true;
}

const RETURN_UNWIND = Symbol.for('@cancjs/coroutine:returnUnwind');

function isReturnUnwind(value: unknown): boolean {
  return value === RETURN_UNWIND;
}

// Driver-understood marker, same trick as RETURN_UNWIND: a loop handle hands its cleanup to the
// driver because the `for...of` return hook that a `break` fires cannot await
const REGISTER_CLEANUP = Symbol.for('@cancjs/coroutine:registerCleanup');

// Driver-understood marker for deriving the current loop target: the sugar `canc.forAwait.next()`
// yields this to ask the driver to resolve and resume with the innermost-entered open loop
const CURRENT_LOOP = Symbol.for('@cancjs/coroutine:currentLoop');

// `PNext` is `any`: a coroutine body mixes bare `yield` (raw value in, no send type) with
// `yield*` (typed send value from `cancAwait`), so no single `PNext` fits every yield in the body.
/** Anything that is not an object can never carry a failure phantom, so admitting the primitive
 * types costs no checking power and keeps a bare `yield` of an ordinary value working. */
type TPrimitiveYield = string | number | boolean | bigint | symbol | null | undefined | void;

/**
 * Return type annotation for a `cancAsync` generator body.
 */
export type AsyncResult<TResult = void, TFailure = unknown> = Generator<
  unknown extends TFailure ? unknown : Failing<TFailure> | TPrimitiveYield,
  TResult,
  any
>;

export interface IGeneratorLikeFn<TThis = any> extends IFn {
  (this: TThis, ...args: any[]): TGeneratorLike;
}

// Brand on the function `cancAsync` hands back, same Symbol.for rationale as BreakError above: it
// survives realm boundaries and duplicated package copies, so wrapping a coroutine a second time is
// caught even when the two wraps come from different copies of this package.
const COROUTINE_BRAND = Symbol.for('@cancjs/coroutine:coroutine');

// The driver only ever calls next/throw/return, and TGeneratorLike deliberately omits
// Symbol.iterator, so isGenerator() would reject generator-likes that drive perfectly well here.
function isGeneratorLike(value: any): boolean {
  return isObject(value) && isFunction(value.next) && isFunction(value.throw);
}

type TCoroutineReturn<TFn extends IGeneratorLikeFn, TReturn = ReturnType<TFn>> = Awaited<
  TReturn extends Generator<infer _Y, infer R, infer _N> ? R : never
>;

type TFlagOptions = Pick<ICancelablePromiseOptions, 'asyncCancel' | 'forceCancelable' | 'bubble' | 'strict' | 'shield'>;

function extractFlagOptions(options?: ICancelablePromiseOptions): TFlagOptions {
  const flags: TFlagOptions = {};

  if (options) {
    if ('asyncCancel' in options) flags.asyncCancel = options.asyncCancel;
    if ('forceCancelable' in options) flags.forceCancelable = options.forceCancelable;
    if ('bubble' in options) flags.bubble = options.bubble;
    if ('strict' in options) flags.strict = options.strict;
    if ('shield' in options) flags.shield = options.shield;
  }

  return flags;
}

function isEmptyFlags(flags: TFlagOptions): boolean {
  for (const _key in flags) {
    return false;
  }

  return true;
}

// `displayName` is a naming-only concern, not a promise option: it must never reach
// `CancelablePromise.withResolvers` (a core type and must not gain it either).
export type TCoroutineOptions = ICancelablePromiseOptions & { displayName?: string };

function toPromiseOptions(options?: TCoroutineOptions): ICancelablePromiseOptions | undefined {
  if (!options) {
    return options;
  }

  const { displayName: _displayName, ...promiseOptions } = options;

  return promiseOptions;
}

type TCoroutineYield<TFn extends IGeneratorLikeFn, TReturn = ReturnType<TFn>> =
  TReturn extends Generator<infer Y, infer _R, infer _N> ? Y : never;

/**
 * Wraps a generator function into a coroutine that returns a `CancelablePromise`.
 *
 * Each `yield` or `yield*` inside the generator represents a cancellation point. Canceling the
 * returned promise triggers generator cleanup by running enclosing `finally` blocks before
 * settling.
 *
 * @param genFn Generator function defining the coroutine body.
 * @param ctx Optional `this` context bound to the generator function.
 * @param options Coroutine and promise execution options.
 */
export function cancAsync<
  TFn extends IGeneratorLikeFn<TThis>,
  TArgs extends any[] = Parameters<TFn>,
  TReturn = TCoroutineReturn<TFn>,
  TThis = any,
  TFailure = FailureOf<TCoroutineYield<TFn>>,
>(genFn: TFn, ctx?: TThis, options?: TCoroutineOptions) {
  if (!isFunction(genFn)) {
    throw new TypeError('Argument is not a function');
  }

  if ((genFn as Record<symbol, unknown>)[COROUTINE_BRAND]) {
    throw new TypeError('Argument is already a coroutine');
  }

  const isCtx = ctx !== undefined;
  const promiseOptions = toPromiseOptions(options);

  // Per-step wrappers carry only flag options; the signal lives on `coroutinePromise`.
  // Computed once here, not per yielded step (options never change across a coroutine's life).
  const stepOptions = extractFlagOptions(options);
  // Skips the resolve() round-trip for yielded CancelablePromises.
  // Fast path is only available when no per-step flags are set.
  const stepOptionsEmpty = isEmptyFlags(stepOptions);
  const shieldOptions: TFlagOptions = { ...stepOptions, shield: true };

  setFnName(coroutine, 'coroutine', genFn, options?.displayName);

  function coroutine(this: any, ...args: TArgs): CancelablePromise<TReturn, TFailure> {
    const {
      promise: coroutinePromise,
      resolve,
      reject,
    } = CancelablePromise.withResolvers<TReturn, TFailure>(promiseOptions);

    try {
      // `this` threading: an explicitly supplied `ctx` wins; otherwise the call-site `this` of the
      // returned coroutine function is forwarded to the generator function.
      const gen: TGeneratorLike<unknown, TReturn> = genFn.apply(isCtx ? ctx : this, args);

      if (!isGeneratorLike(gen)) {
        throw new TypeError(
          isThenable(gen) ?
            'A coroutine body must be a generator function, but this one returned a promise. ' +
              'An async function cannot be a coroutine body: write a generator and yield* each ' +
              'awaited step.'
          : 'A coroutine body must be a generator function',
        );
      }

      // Tracks whether the generator has reported `done`, guards against re-entering a finished
      // generator via gen.next()/gen.throw().
      let genDone = false;
      // Re-entrancy guard for the cancel-triggered finally drain: a single cancel() must not spawn
      // overlapping drains, and post-cancel ordinary steps must go inert.
      let draining = false;
      let executing = false;
      let canceledReason: any = undefined;
      let canceled = false;
      // Set when the cancel came through the disposal path (Symbol.dispose / Symbol.asyncDispose):
      // the drain's terminal CancelError is marked `disposed` for parity with core _dispose.
      let disposing = false;

      let abortableTryBodySource: CancelablePromise<any, any> | undefined;

      // Loop handles opened by this invocation, so two calls of one coroutine never share sources
      const pendingCleanups: ILoopHandle[] = [];

      let drainDeferred: { promise: CancelablePromise<any>; resolve: (v?: any) => void } | undefined;
      const settleDrain = () => {
        if (drainDeferred) {
          drainDeferred.resolve();
        }
      };

      // Every drain outcome lands here, so an open loop closes its source before the coroutine
      // settles as canceled
      const rejectDrained = (error: any) => {
        finishCleanups(pendingCleanups, shieldOptions, () => {
          reject(error);
          settleDrain();
        });
      };

      // Delegates guards to prototype semantics before draining.
      // Defers settlement to the finally drain.
      coroutinePromise.cancel = function (reason?: any, _disposing?: boolean): any {
        const self = coroutinePromise;

        // Returns the same awaitable on re-cancel.
        // Bypasses strict throw on second cancel.
        if (canceled && !genDone) {
          return self.asyncCancel ? drainDeferred!.promise : undefined;
        }

        if (self.shield && self.cancelable) {
          if (self.strict && !_disposing) {
            throw new Error('Shielded promise cannot be canceled');
          }
          return undefined;
        }

        if (genDone || !self.cancelable) {
          if (self.strict && !_disposing) {
            throw new Error(`${self.canceled ? 'Canceled' : 'Settled'} promise cannot be canceled`);
          }
          return undefined;
        }

        // Fresh cancel on a live coroutine: start the finally drain and own settlement.
        canceled = true;
        canceledReason = reason;
        disposing = _disposing === true;

        if (self.asyncCancel) {
          const d = CancelablePromise.withResolvers<any>({ shield: true });
          drainDeferred = { promise: d.promise, resolve: d.resolve as (v?: any) => void };

          // Participate in cleanup collector: if this cancel is part of a cascade,
          // push the drain promise so the initiator's allSettled covers coroutine cleanup.
          const collector = (CancelablePromise as any)._activeCollector as any[] | undefined;
          if (collector) {
            collector.push(d.promise);
          }
        }

        drainFinally();

        return self.asyncCancel ? drainDeferred!.promise : undefined;
      };

      const step = (result: any) => {
        if (result.done) {
          genDone = true;

          // Post-cancel ordinary completion is inert: the finally drain owns settlement; do not
          // resolve (and do not settle as canceled, as the drain will).
          if (!canceled) {
            finishCleanups(pendingCleanups, shieldOptions, resolve, result.value);
          }
        } else {
          if (canceled) {
            return;
          }

          const value = result.value;
          let source: CancelablePromise<any, any>;

          if (stepOptionsEmpty && value instanceof CancelablePromise && value.constructor === CancelablePromise) {
            source = value;
          } else {
            // Only reached off the yielded-CancelablePromise fast path, so a step yielding a plain
            // CancelablePromise never pays for the marker lookup
            const loop: ILoopHandle | undefined = isObject(value) ? (value as any)[REGISTER_CLEANUP] : undefined;

            if (loop !== undefined) {
              registerLoopHandle(loop, pendingCleanups);
              onFulfilled(undefined);

              return;
            }

            const currentLoopMarked: boolean = isObject(value) ? (value as any)[CURRENT_LOOP] : false;

            if (currentLoopMarked) {
              let target: ILoopHandle | undefined;
              let maxEnteredAt = 0;

              for (const candidate of pendingCleanups) {
                if (candidate._used && !candidate._finished && candidate._enteredAt > maxEnteredAt) {
                  target = candidate;
                  maxEnteredAt = candidate._enteredAt;
                }
              }

              if (!target) {
                onRejected(
                  new IterationError('No active forAwait loop; canc.forAwait.next() requires a loop in the body'),
                );
                return;
              }

              onFulfilled(target);

              return;
            }

            source = CancelablePromise.resolve(value, stepOptions);
          }

          abortableTryBodySource = source;
          const promise = source.then(onFulfilled, onRejected);
          promise['_chain'](coroutinePromise);
        }
      };

      const onFulfilled = (value: any) => {
        // This step settled: it is no longer the outstanding try-body step to abort on drain.
        abortableTryBodySource = undefined;
        // Coroutine canceled while this step was in flight: drop it (drainFinally owns the rest).
        if (canceled || genDone) {
          return;
        }

        let result: IteratorResult<any>;
        executing = true;
        try {
          result = gen.next(value);
        } catch (err) {
          genDone = true;
          finishCleanups(pendingCleanups, shieldOptions, reject, err);
          return;
        } finally {
          executing = false;
        }
        if (canceled) {
          drainFinally();
          return;
        }
        step(result);
      };

      const onRejected = (value: any) => {
        abortableTryBodySource = undefined;
        if (canceled || genDone) {
          return;
        }

        let result: IteratorResult<any>;
        executing = true;
        try {
          result = gen.throw(value);
        } catch (err) {
          genDone = true;
          finishCleanups(pendingCleanups, shieldOptions, reject, err);
          return;
        } finally {
          executing = false;
        }
        if (canceled) {
          drainFinally();
          return;
        }
        step(result);
      };

      // Triggers finally drain via gen.return().
      // Awaits yielded cleanup steps as shielded promises.
      // Settles coroutine as canceled when finished.
      const drainFinally = () => {
        if (draining || genDone) {
          return;
        }
        // Re-entrant cancel from inside a running step: the generator is still on the stack, so
        // gen.return() here would throw "Generator is already executing". Bail; the step's own
        // post-run check (onFulfilled/onRejected) calls drainFinally() again once the generator
        // unwinds. `canceled`/`canceledReason` are already set by cancel(), so nothing is lost.
        if (executing) {
          return;
        }
        draining = true;

        const outstanding = abortableTryBodySource;
        abortableTryBodySource = undefined;
        if (outstanding?.cancelable) {
          outstanding.cancel(canceledReason);
        }

        let result: IteratorResult<any>;
        executing = true;
        try {
          result = gen.return(canceledReason);
        } catch (err) {
          // A finally block threw synchronously: surface it as the coroutine rejection.
          genDone = true;
          rejectDrained(err);
          return;
        } finally {
          executing = false;
        }

        pumpFinally(result);
      };

      // Drives one finally-yield step: if not done, await the yielded value as a shielded (never
      // canceled, never chained) promise and resume the generator with its result / thrown reason.
      // When the generator reports done, settles the coroutine promise as canceled.
      const pumpFinally = (result: IteratorResult<any>) => {
        if (result.done) {
          // Finally drain complete: settle the coroutine as canceled, preserving the original
          // cancel reason normalized like core cancel() (CancelError passthrough,
          // object as cause, string or undefined as message).
          genDone = true;
          const error =
            isCancelError(canceledReason) ? canceledReason
            : isObject(canceledReason) ? new CancelError(undefined, { cause: canceledReason })
            : new CancelError(canceledReason);
          if (disposing) {
            error.disposed = true;
          }
          rejectDrained(error);
          return;
        }

        if (isReturnUnwind(result.value)) {
          let next: IteratorResult<any>;
          try {
            next = gen.return(canceledReason);
          } catch (err) {
            genDone = true;
            rejectDrained(err);
            return;
          }
          pumpFinally(next);
          return;
        }

        // A handle opened inside a finally must reach the registry the ordinary step path uses, or
        // nothing closes its source
        const drainLoop: ILoopHandle | undefined =
          isObject(result.value) ? (result.value as any)[REGISTER_CLEANUP] : undefined;

        if (drainLoop !== undefined) {
          registerLoopHandle(drainLoop, pendingCleanups);

          let next: IteratorResult<any>;
          try {
            next = gen.next(undefined);
          } catch (err) {
            genDone = true;
            rejectDrained(err);
            return;
          }
          pumpFinally(next);
          return;
        }

        const shielded = CancelablePromise.resolve(result.value, shieldOptions);

        shielded.then(
          (value: any) => {
            let next: IteratorResult<any>;
            try {
              next = gen.next(value);
            } catch (err) {
              // Finally block threw after a yield: surface it as the rejection.
              genDone = true;
              rejectDrained(err);
              return;
            }
            pumpFinally(next);
          },
          (reason: any) => {
            let next: IteratorResult<any>;
            try {
              next = gen.throw(reason);
            } catch (err) {
              // Finally block threw after a yield in the error handler: surface it.
              genDone = true;
              rejectDrained(err);
              return;
            }
            pumpFinally(next);
          },
        );
      };

      executing = true;
      let first: IteratorResult<any>;
      try {
        first = gen.next();
      } finally {
        executing = false;
      }
      if (canceled) {
        drainFinally();
      } else {
        step(first);
      }
    } catch (err) {
      // Sync-throw generators: genFn.apply(...) or the first gen.next() throwing synchronously
      // rejects the coroutine.
      reject(err);
    }

    return coroutinePromise;
  }

  Object.defineProperty(coroutine, COROUTINE_BRAND, { value: true });

  return coroutine;
}

// https://github.com/microsoft/TypeScript/issues/36855#issuecomment-588286256
function createYielder<TProduce, TSend>(
  _call: (y: TProduce) => TSend,
): (arg: TProduce) => Generator<TProduce, TSend, TSend> {
  return function* (arg: TProduce): Generator<TProduce, TSend, TSend> {
    return yield arg;
  };
}

/**
 * `throw`, as a yieldable step. Runtime: a generator that throws on its first `next()`, so `yield*`
 * propagates it at the call site and ordinary try/catch/finally behaves exactly as with a bare
 * `throw`. The yield type is a type-level carrier only; nothing is ever yielded.
 *
 * `yield*` is not a call expression, so TypeScript does not treat what follows as unreachable.
 * A bare `yield* canc.throw(e)` as the last statement of a body with a declared non-void return type
 * gives TS2355 ("A function whose declared type is neither 'undefined', 'void', nor 'any' must return
 * a value"). Use `return yield* canc.throw(e)` instead, as `never` widens to any return type.
 */
export function cancThrow<TFailure>(error: TFailure): Generator<Failing<TFailure>, never, any> {
  return (function* (): Generator<Failing<TFailure>, never, any> {
    throw error;
  })();
}

type cancAwait = <T>(value: T) => T;

/**
 * One-shot combinator helpers for the typed `yield*` path.
 *
 * `cancAwait.all([...])` and its siblings fold a combinator into a single
 * yielded step: they build the corresponding `CancelablePromise.all/race/any/
 * allSettled` and yield THAT one promise, so at runtime the coroutine driver
 * still awaits exactly one value (identical handling to `yield combined`). The
 * value they carry over `yield*` is the combinator's own result, so tuple
 * inference is preserved:
 *
 * const [n, s] = yield* cancAwait.all([Promise.resolve(1), Promise.resolve('a')]);
 * // ^ number ^ string: tuple, not `unknown[]`
 *
 * Tuple inference has to be reconstructed here rather than projected off the
 * static. `Parameters`/`ReturnType` only see the LAST overload of an overloaded
 * function (for `all` that's the variadic `Iterable` fallback,
 * `CancelablePromise<T[]>`), and matching the overload set structurally erases
 * each overload's own generics to `unknown`. So each combinator's generator
 * signature is declared directly over a tuple type param and maps the element
 * types the same way the native `lib.es*` combinator lib does. The mapped
 * result is the `yield*` value type, so `const [n, s] = yield* cancAwait.all(...)`
 * infers `[number, string]`, not `unknown[]`.
 */
type TAwaitedTuple<T extends readonly unknown[]> = { -readonly [K in keyof T]: Awaited<T[K]> };
type TSettledTuple<T extends readonly unknown[]> = { -readonly [K in keyof T]: PromiseSettledResult<Awaited<T[K]>> };

type ICancAwaitAll = <T extends readonly unknown[] | []>(
  values: readonly [...T],
  options?: ICancelablePromiseOptions,
) => Generator<CancelablePromise<TAwaitedTuple<T>, FailureOf<T[number]>>, TAwaitedTuple<T>, TAwaitedTuple<T>>;

type ICancAwaitRace = <T extends readonly unknown[] | []>(
  values: readonly [...T],
  options?: ICancelablePromiseOptions,
) => Generator<CancelablePromise<Awaited<T[number]>, FailureOf<T[number]>>, Awaited<T[number]>, Awaited<T[number]>>;

type ICancAwaitAny = <T extends readonly unknown[] | []>(
  values: readonly [...T],
  options?: ICancelablePromiseOptions,
) => Generator<CancelablePromise<Awaited<T[number]>, AggregateError>, Awaited<T[number]>, Awaited<T[number]>>;

type ICancAwaitAllSettled = <T extends readonly unknown[] | []>(
  values: readonly [...T],
  options?: ICancelablePromiseOptions,
) => Generator<CancelablePromise<TSettledTuple<T>, never>, TSettledTuple<T>, TSettledTuple<T>>;

// Mirrors `CancelablePromise.try`: folds a possibly-sync-throwing call into a single yielded step.
// The `yield*` value is the call's own (awaited) result, same tuple-free shape as a plain
// `cancAwait(value)`; there is only one return type here, no tuple to reconstruct.
type ICancAwaitTry = <T, TArgs extends any[]>(
  fn: (...args: TArgs) => T | PromiseLike<T>,
  ...args: TArgs
) => Generator<CancelablePromise<Awaited<T>, FailureOf<T>>, Awaited<T>, Awaited<T>>;

export type TEachSource<T> = AsyncIterable<T> | Iterable<T | Promise<T>>;

export type TForAwaitCallback<T> =
  | ((value: T, index: number) => void | false)
  | ((value: T, index: number) => Generator<unknown, void | false, any>)
  | ((value: T, index: number) => CancelablePromise<void | false>);

/**
 * Handle over an iteration source, returned by the single-argument form of `cancForAwait`.
 *
 * The handle is consumed with an ordinary `for...of`, which keeps the loop body in the caller's own
 * frame: `break`, `continue` and `return` are the native keywords, and the body closes over the
 * enclosing bindings directly. Each turn of the body must advance the handle with
 * `yield* loop.next()` before the loop repeats. A handle iterates once.
 */
export interface ICancForAwaitLoop<T> {
  /** Iterator over the already-fetched item. Never suspends, so the loop body runs in one frame. */
  [Symbol.iterator](): Iterator<T>;
  /** Pulls the next item at a coroutine cancellation point. Delegate it with `yield*`. */
  next(): Generator<unknown, void, any>;
  /** Ends the iteration and finishes source cleanup at this point. Delegate it with `yield*`. */
  return(): Generator<unknown, void, any>;
}

/**
 * Iterates over an async or sync iterable, running a callback per item at coroutine cancellation points.
 *
 * The callback supports three forms: a sync return, a generator (driven with `yield*`), or a
 * `CancelablePromise` (awaited with `yield`). Returning `false` or throwing `BreakError` stops the
 * loop cleanly. Plain `async` callbacks returning native promises are intentionally not
 * type-supported to steer callers toward cancelable operations, though the runtime dispatches any
 * thenable. Use `cancForAwait.toArray` to collect elements into an array.
 *
 * Called without a callback it returns a loop handle instead, for a `for...of` body with native
 * `break` and `continue`. See `ICancForAwaitLoop`.
 */
interface ICancForAwait {
  <T>(source: TEachSource<T>): Generator<unknown, ICancForAwaitLoop<T>, any>;
  <T>(source: TEachSource<T>, cb: TForAwaitCallback<T>): Generator<Failing<BreakError>, void, any>;
  /** Collects elements into an array. */
  toArray<T>(source: TEachSource<T>): Generator<Failing<BreakError>, T[], any>;
  /** Advances the innermost open forAwait loop. Delegate it with `yield*`. */
  next(): Generator<unknown, void, any>;
}

interface ICancAwait {
  <T>(value: T): Generator<T, Awaited<T>, any>;
  all: ICancAwaitAll;
  race: ICancAwaitRace;
  any: ICancAwaitAny;
  allSettled: ICancAwaitAllSettled;
  try: ICancAwaitTry;
}

function makeCombinator(build: (...args: any[]) => CancelablePromise<any, any>) {
  return function* (...args: any[]): Generator<any, any, any> {
    return yield build(...args);
  };
}

export const cancAwait = createYielder(null as unknown as cancAwait) as ICancAwait;

cancAwait.all = makeCombinator(CancelablePromise.all.bind(CancelablePromise)) as ICancAwait['all'];
cancAwait.race = makeCombinator(CancelablePromise.race.bind(CancelablePromise)) as ICancAwait['race'];
cancAwait.any = makeCombinator(CancelablePromise.any.bind(CancelablePromise)) as ICancAwait['any'];
cancAwait.allSettled = makeCombinator(CancelablePromise.allSettled.bind(CancelablePromise)) as ICancAwait['allSettled'];
cancAwait.try = makeCombinator(CancelablePromise.try.bind(CancelablePromise)) as ICancAwait['try'];

export function getStepIterator(source: any): { it: any; async: boolean } {
  if (source != null && isFunction(source[Symbol.asyncIterator])) {
    return { it: source[Symbol.asyncIterator](), async: true };
  }

  if (source != null && isFunction(source[Symbol.iterator])) {
    return { it: source[Symbol.iterator](), async: false };
  }

  throw new TypeError('Argument is not iterable');
}

export function returnStepIterator(it: any): any {
  if (it == null || !isFunction(it.return)) {
    return undefined;
  }

  let result: any;
  try {
    result = it.return();
  } catch {
    return undefined;
  }

  if (isObject(result) && isFunction((result as any).then)) {
    return (result as PromiseLike<any>).then(
      () => undefined,
      () => undefined,
    );
  }

  return result;
}

// Shared by every exhausted handle, so a done turn allocates nothing
const DONE_RESULT: IteratorResult<any> = { value: undefined, done: true };

interface ILoopHandle extends ICancForAwaitLoop<any> {
  _it: any;
  _async: boolean;
  _current: IteratorResult<any>;
  _stale: boolean;
  _used: boolean;
  _finished: boolean;
  _disposing: boolean;
  _enteredAt: number;
  _registry: ILoopHandle[] | undefined;
  _disposed: PromiseLike<void> | undefined;
}

// Closes the source once, and what lands on `_disposed` is safe to await bare because
// `returnStepIterator` has already neutralized a rejecting `return()`
function disposeLoop(loop: ILoopHandle): PromiseLike<void> | undefined {
  if (!loop._disposing) {
    loop._disposing = true;
    loop._finished = true;
    loop._stale = false;

    const cleanup = returnStepIterator(loop._it);
    loop._disposed = isThenable(cleanup) ? (cleanup as PromiseLike<void>) : undefined;
  }

  return loop._disposed;
}

function registerLoopHandle(loop: ILoopHandle, registry: ILoopHandle[]): void {
  loop._registry = registry;
  registry.push(loop);
}

// A handle that closed itself drops out, so the settle path has nothing to wait on in the
// common case
function unregisterLoop(loop: ILoopHandle): void {
  const registry = loop._registry;

  if (!registry) {
    return;
  }

  const index = registry.indexOf(loop);
  if (index >= 0) {
    registry.splice(index, 1);
  }

  loop._registry = undefined;
}

// Settles only after every loop handle the coroutine still holds has closed its source, and stays
// on the old synchronous path when nothing registered
function finishCleanups(
  pending: ILoopHandle[],
  options: TFlagOptions,
  settle: (value?: any) => void,
  value?: any,
): void {
  if (pending.length === 0) {
    settle(value);

    return;
  }

  const loops = pending.splice(0, pending.length);
  const cleanups: Array<PromiseLike<void>> = [];

  for (const loop of loops) {
    const cleanup = disposeLoop(loop);

    if (cleanup) {
      cleanups.push(cleanup);
    }
  }

  if (cleanups.length === 0) {
    settle(value);

    return;
  }

  // Safe as a plain `all`: every cleanup came back from returnStepIterator already neutralized.
  const done = () => settle(value);
  CancelablePromise.all(cleanups, options).then(done, done);
}

function* pullNextItem(loop: ILoopHandle): Generator<unknown, void, any> {
  if (loop._finished) {
    return;
  }

  const result: IteratorResult<any> = loop._async ? yield loop._it.next() : loop._it.next();

  if (result.done) {
    loop._current = DONE_RESULT;
    const cleanup = disposeLoop(loop);

    if (cleanup) {
      yield cleanup;
    }

    unregisterLoop(loop);

    return;
  }

  // A sync source may hold promises, same as in the callback form: awaiting here keeps the item a
  // cancellation point rather than handing the body a promise.
  loop._current = { value: loop._async ? result.value : yield result.value, done: false };
  loop._stale = false;
}

function* returnLoop(loop: ILoopHandle): Generator<unknown, void, any> {
  const cleanup = disposeLoop(loop);

  if (cleanup) {
    yield cleanup;
  }

  unregisterLoop(loop);
}

let loopEntrySeq = 0;

function createLoopHandle(it: any, async: boolean): ILoopHandle {
  const loop = {
    _it: it,
    _async: async,
    _current: DONE_RESULT,
    _stale: false,
    _used: false,
    _finished: false,
    _disposing: false,
    _enteredAt: 0,
    _registry: undefined,
    _disposed: undefined,

    [Symbol.iterator](): Iterator<any> {
      if (loop._used) {
        throw new IterationError('A forAwait loop handle iterates once, call forAwait again for another pass');
      }
      loop._used = true;
      loop._enteredAt = ++loopEntrySeq;

      return {
        next(): IteratorResult<any> {
          // Without this the body that forgets to advance would spin forever on one item, since the
          // sync iterator has nothing else to hand back.
          if (loop._stale) {
            throw new IterationError('A forAwait loop body must advance the handle with yield* loop.next() every turn');
          }

          if (loop._current.done) {
            return DONE_RESULT;
          }

          loop._stale = true;

          return loop._current;
        },

        return(value?: any): IteratorResult<any> {
          disposeLoop(loop);

          return { value, done: true };
        },
      };
    },

    next(): Generator<unknown, void, any> {
      return pullNextItem(loop);
    },

    return(): Generator<unknown, void, any> {
      return returnLoop(loop);
    },
  } as ILoopHandle;

  return loop;
}

function* loopHandleForm(source: any): Generator<unknown, ILoopHandle, any> {
  const { it, async } = getStepIterator(source);
  const loop = createLoopHandle(it, async);

  // Registration precedes the first pull on purpose: a cancel landing during that pull must still
  // close the source.
  yield { [REGISTER_CLEANUP]: loop };
  yield* pullNextItem(loop);

  return loop;
}

/**
 * Iterates over an async or sync iterable, running a callback per item at coroutine cancellation points.
 *
 * The callback supports three forms: a sync return, a generator (driven with `yield*`), or a
 * `CancelablePromise` (awaited with `yield`). Returning `false` or throwing `BreakError` stops the
 * loop cleanly. Plain `async` callbacks returning native promises are intentionally not
 * type-supported to steer callers toward cancelable operations, though the runtime dispatches any
 * thenable. Use `cancForAwait.toArray` to collect elements into an array.
 */
export const cancForAwait = function* cancForAwait(
  source: any,
  cb?: (value: any, index: number) => any,
): Generator<unknown, any, any> {
  if (cb === undefined) {
    return yield* loopHandleForm(source);
  }

  const { it, async } = getStepIterator(source);
  let index = 0;

  try {
    while (true) {
      const result: IteratorResult<any> = async ? yield it.next() : it.next();

      if (result.done) {
        break;
      }

      const value = async ? result.value : yield result.value;

      // Three callback forms: a generator (drive it with `yield*` so `await`s in the body run at
      // coroutine cancellation points), a thenable (await with a bare `yield`), or a plain value
      const outcome = cb(value, index++);
      const settled =
        isGenerator(outcome) ? yield* outcome
        : isThenable(outcome) ? yield outcome
        : outcome;

      if (settled === false) {
        break;
      }
    }
  } catch (err) {
    if (!isBreakError(err)) {
      throw err;
    }
  } finally {
    yield returnStepIterator(it);
    yield RETURN_UNWIND;
  }
} as ICancForAwait;

cancForAwait.toArray = function* toArray(source: any): Generator<unknown, any[], any> {
  const { it, async } = getStepIterator(source);
  const collected: any[] = [];

  try {
    while (true) {
      const result: IteratorResult<any> = async ? yield it.next() : it.next();

      if (result.done) {
        break;
      }

      collected.push(async ? result.value : yield result.value);
    }
  } finally {
    yield returnStepIterator(it);
    yield RETURN_UNWIND;
  }

  return collected;
} as ICancForAwait['toArray'];

cancForAwait.next = function* next(): Generator<unknown, void, any> {
  const loop = yield { [CURRENT_LOOP]: true };
  yield* pullNextItem(loop);
} as ICancForAwait['next'];

function findDescriptor(instance: any, key: string): PropertyDescriptor | undefined {
  let target: any = instance;

  while (target) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor) {
      return descriptor;
    }
    target = Object.getPrototypeOf(target);
  }

  return undefined;
}

/**
 * Runtime half of the member decorators, so `wrap` decides which one this is. The member's kind
 * decides what happens to it, exactly as in the decorators: a getter has already produced the
 * finished function (a coroutine, in the AsyncMethod case), so it is only read once, bound, and
 * memoized; a method or a function-valued field is raw and goes through `wrap`.
 */
function installMethod(instance: any, key: string, wrap: (fn: IFn, ctx: any) => IFn): void {
  const descriptor = findDescriptor(instance, key);
  const raw = instance[key];

  if (!isFunction(raw)) {
    throw new TypeError(`'${key}' did not resolve to a function`);
  }

  const value = descriptor?.get ? raw.bind(instance) : wrap(raw, instance);

  Object.defineProperty(instance, key, {
    value: copyFunctionMetadata(raw, value),
    writable: true,
    configurable: true,
    enumerable: true,
  });
}

/** Per-instance equivalent of `@AsyncMethod({ bind: true })`, for code that avoids decorators. */
export function asyncMethod<T>(instance: T, key: keyof T & string, options?: TCoroutineOptions): void {
  installMethod(instance, key, (fn, ctx) => cancAsync(fn as IGeneratorLikeFn, ctx, options));
}

/** Per-instance equivalent of `@BindMethod()`, for code that avoids decorators. */
export function bindMethod<T>(instance: T, key: keyof T & string): void {
  installMethod(instance, key, (fn, ctx) => fn.bind(ctx) as IFn);
}
