import { AggregateError, CancelablePromise, Failing, ICancelablePromiseOptions, ISettledResult } from '@cancjs/promise';

import {
  assertGeneratorResult,
  assertStepResult,
  copyFunctionMetadata,
  IFn,
  isFunction,
  isGenerator,
  isObject,
  isThenable,
  IterationError,
  setFnName,
} from '../../_util';
import type { CoBodyFailureOf, CoFailureOf } from './step-failure';

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

// cross-copy members of a promise copy that counts consumers without a child promise
interface ICountedSource {
  _subscribe(onFulfilled: (value: any) => unknown, onRejected: (reason: any) => unknown): void;
  _retainRef(): (() => void) | undefined;
}

const RETURN_UNWIND = Symbol.for('@cancjs/coroutine:returnUnwind');

function isReturnUnwind(value: unknown): boolean {
  return value === RETURN_UNWIND;
}

// Drives a delegate's return-path cleanup in place of the original return, which a `finally` that
// yields would otherwise turn into a normal completion of `yield*` and resume the caller
function* finishReturn(inner: Generator<unknown, any, any>): Generator<unknown, void, any> {
  let result = inner.return(undefined);

  while (!result.done) {
    let sent: any;
    let threw = false;

    try {
      sent = yield result.value;
    } catch (error) {
      sent = error;
      threw = true;
    }

    result = threw ? inner.throw(sent) : inner.next(sent);
  }
}

/**
 * `yield*` over a generator that keeps a forwarded return a return. Once the delegate finishes its
 * cleanup, `marker` asks the driver to return again, so the caller never resumes after the delegate.
 */
export function* delegateUnwinding<TReturn>(
  inner: Generator<unknown, TReturn, any>,
  marker: symbol,
): Generator<unknown, TReturn, any> {
  let result = inner.next();

  while (!result.done) {
    let resumed = false;
    let threw = false;
    let sent: any;

    try {
      sent = yield result.value;
      resumed = true;
    } catch (error) {
      sent = error;
      threw = true;
      resumed = true;
    } finally {
      if (!resumed) {
        yield* finishReturn(inner);
        yield marker;
      }
    }

    result = threw ? inner.throw(sent) : inner.next(sent);
  }

  return result.value;
}

interface IForwardedCancel {
  stop: () => void;
  unwind: () => void;
  stopped: boolean;
}

// shared by both dialects, so a cancel crossing between them stays flat too
const forwardedCancels: IForwardedCancel[] = [];
let forwarding = false;

/**
 * Stops the step a canceled body awaits, then unwinds the body. A nested coroutine reached while
 * stopping only enqueues its own pair, so the outermost call walks the whole nest in a loop and a
 * deep nest never grows the stack. Inner levels still unwind before the levels that await them.
 */
export function forwardCancel(stop: () => void, unwind: () => void): void {
  forwardedCancels.push({ stop, unwind, stopped: false });
  if (forwarding) {
    return;
  }

  forwarding = true;
  let failed = false;
  let failure: unknown;
  try {
    while (forwardedCancels.length > 0) {
      const entry = forwardedCancels[forwardedCancels.length - 1];
      try {
        if (entry.stopped) {
          forwardedCancels.pop();
          entry.unwind();
        } else {
          entry.stopped = true;
          entry.stop();
        }
      } catch (error) {
        // the rest of the nest still unwinds, the first error reaches the outermost caller
        if (!failed) {
          failed = true;
          failure = error;
        }
      }
    }
  } finally {
    forwarding = false;
  }

  if (failed) {
    throw failure;
  }
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

const BODY_CONTEXT = 'A coroutine body must be a generator function';
const STEP_CONTEXT = 'A coroutine body produced an invalid step';

function checkedStep(result: unknown): IteratorResult<any> {
  assertStepResult(result, STEP_CONTEXT);
  return result;
}

// a cancel landing on a shielded step waits for it, then unwinds at the next unshielded step
function isShieldedStep(value: unknown): boolean {
  return isThenable(value) && (value as { shield?: unknown }).shield === true;
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
 * settling. The promise stays pending, with `canceled` still `false`, until that cleanup ends; cancel
 * handlers then run with the original reason. An already aborted `signal` skips the body entirely.
 * A cancel never resumes the body after a `cancForAwait` helper, but a generator of your own,
 * delegated with `yield*`, resumes its caller when its `finally` awaits. Check `signal.aborted`
 * after such a call.
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
  TFailure = CoBodyFailureOf<TCoroutineYield<TFn>>,
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
    let coroutinePromise: CancelablePromise<TReturn, TFailure>;
    let resolve: (value: TReturn) => void;
    let reject: (reason?: any) => void;

    try {
      ({
        promise: coroutinePromise,
        resolve,
        reject,
      } = CancelablePromise.withResolvers<TReturn, TFailure>(promiseOptions));
    } catch (err) {
      // a strict pre-aborted signal throws here, the caller still gets a promise
      return CancelablePromise.reject<TReturn, any>(err) as CancelablePromise<TReturn, TFailure>;
    }

    // born canceled by a pre-aborted signal: the body must not run at all
    if (coroutinePromise.canceled) {
      return coroutinePromise;
    }

    // set once a cancel is accepted, so a body error after it still settles the drain awaitable
    let rejectAfterCancel: ((error: any) => void) | undefined;

    try {
      // `this` threading: an explicitly supplied `ctx` wins; otherwise the call-site `this` of the
      // returned coroutine function is forwarded to the generator function.
      const gen: TGeneratorLike<unknown, TReturn> = genFn.apply(isCtx ? ctx : this, args);

      if (isThenable(gen)) {
        throw new TypeError(
          'A coroutine body must be a generator function, but this one returned a promise. ' +
            'An async function cannot be a coroutine body: write a generator and yield* each ' +
            'awaited step.',
        );
      }

      assertGeneratorResult(gen, BODY_CONTEXT);

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
      // counted consumer ref on a yielded shared source, released instead of canceling it
      let releaseStepSource: (() => void) | undefined;
      let shieldedStep = false;
      // cancel accepted mid shielded step: body runs on to its next unshielded step
      let cancelDeferred = false;

      // Loop handles opened by this invocation, so two calls of one coroutine never share sources
      const pendingCleanups: ILoopRegistry = Object.assign([], { _entries: 0 });

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

      // Core cancel settles the drained coroutine, so handlers get the raw reason and the
      // rejection follows the core reason rule
      const settleCanceled = () => {
        if (!coroutinePromise.cancelable) {
          return;
        }

        try {
          (coroutinePromise as any)._cancel(canceledReason, disposing);
        } catch (_e) {
          // the drain has no caller to receive a handler error
        }
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
        rejectAfterCancel = rejectDrained;

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

        if (shieldedStep) {
          cancelDeferred = true;
        } else {
          drainFinally();
        }

        return self.asyncCancel ? drainDeferred!.promise : undefined;
      };

      // a deferred cancel unwinds once the body yields something unshielded
      const unwindDeferred = () => {
        if (cancelDeferred && !shieldedStep && !genDone) {
          cancelDeferred = false;
          drainFinally();
        }
      };

      const findCurrentLoop = (registry: ILoopRegistry): ILoopHandle | undefined => {
        let target: ILoopHandle | undefined;
        let maxEnteredAt = 0;

        for (const candidate of registry) {
          if (candidate._used && !candidate._finished && candidate._enteredAt > maxEnteredAt) {
            target = candidate;
            maxEnteredAt = candidate._enteredAt;
          }
        }

        return target;
      };

      const step = (result: any) => {
        if (result.done) {
          genDone = true;

          // Post-cancel ordinary completion is inert: the finally drain owns settlement; do not
          // resolve (and do not settle as canceled, as the drain will).
          if (!canceled) {
            finishCleanups(pendingCleanups, shieldOptions, resolve, result.value);
          } else if (cancelDeferred) {
            // the body returned before any unshielded step, the accepted cancel still decides
            cancelDeferred = false;
            finishCleanups(pendingCleanups, shieldOptions, () => {
              settleCanceled();
              settleDrain();
            });
          }
        } else {
          if (canceled && !cancelDeferred) {
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
              const target = findCurrentLoop(pendingCleanups);

              if (!target) {
                onFulfilled(undefined);
                return;
              }

              onFulfilled(target);

              return;
            }

            // the wrapper is ours alone, so the drain cancels it directly
            source = CancelablePromise.resolve(value, stepOptions);
            abortableTryBodySource = source;
            shieldedStep = isShieldedStep(value);
            void source.then(onFulfilled, onRejected);
            return;
          }

          shieldedStep = isShieldedStep(source);
          const counted = source as unknown as Partial<ICountedSource>;
          if (typeof counted._retainRef === 'function' && typeof counted._subscribe === 'function') {
            // a shared source stops only once its last consumer is gone
            counted._subscribe(onFulfilled, onRejected);
            releaseStepSource = counted._retainRef();
          } else {
            // a promise copy without counted refs: the drain cancels the source directly
            abortableTryBodySource = source;
            void source.then(onFulfilled, onRejected);
          }
        }
      };

      const onFulfilled = (value: any) => {
        // This step settled: it is no longer the outstanding try-body step to abort on drain.
        abortableTryBodySource = undefined;
        releaseStepSource = undefined;
        shieldedStep = false;
        // Coroutine canceled while this step was in flight: drop it (drainFinally owns the rest).
        if ((canceled && !cancelDeferred) || genDone) {
          return;
        }

        let result: IteratorResult<any>;
        executing = true;
        try {
          result = checkedStep(gen.next(value));
        } catch (err) {
          genDone = true;
          cancelDeferred = false;
          if (canceled) {
            rejectDrained(err);
          } else {
            finishCleanups(pendingCleanups, shieldOptions, reject, err);
          }
          return;
        } finally {
          executing = false;
        }
        if (canceled && !cancelDeferred) {
          drainFinally();
          return;
        }
        step(result);
        unwindDeferred();
      };

      const onRejected = (value: any) => {
        abortableTryBodySource = undefined;
        releaseStepSource = undefined;
        shieldedStep = false;
        if ((canceled && !cancelDeferred) || genDone) {
          return;
        }

        let result: IteratorResult<any>;
        executing = true;
        try {
          result = checkedStep(gen.throw(value));
        } catch (err) {
          genDone = true;
          cancelDeferred = false;
          if (canceled) {
            rejectDrained(err);
          } else {
            finishCleanups(pendingCleanups, shieldOptions, reject, err);
          }
          return;
        } finally {
          executing = false;
        }
        if (canceled && !cancelDeferred) {
          drainFinally();
          return;
        }
        step(result);
        unwindDeferred();
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
        const release = releaseStepSource;
        releaseStepSource = undefined;

        forwardCancel(() => {
          if (outstanding?.cancelable) {
            outstanding.cancel(canceledReason);
          }
          if (release) {
            release();
          }
        }, returnFromBody);
      };

      const returnFromBody = () => {
        let result: IteratorResult<any>;
        executing = true;
        try {
          result = checkedStep(gen.return(canceledReason));
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
          genDone = true;
          finishCleanups(pendingCleanups, shieldOptions, () => {
            settleCanceled();
            settleDrain();
          });
          return;
        }

        if (isReturnUnwind(result.value)) {
          let next: IteratorResult<any>;
          try {
            next = checkedStep(gen.return(canceledReason));
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
            next = checkedStep(gen.next(undefined));
          } catch (err) {
            genDone = true;
            rejectDrained(err);
            return;
          }
          pumpFinally(next);
          return;
        }

        // drain pump resolves ordinary yields through shield, which would hand the marker back as the loop
        if (isObject(result.value) && (result.value as any)[CURRENT_LOOP]) {
          let next: IteratorResult<any>;
          try {
            next = checkedStep(gen.next(findCurrentLoop(pendingCleanups)));
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
              next = checkedStep(gen.next(value));
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
              next = checkedStep(gen.throw(reason));
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
        first = checkedStep(gen.next());
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
      if (rejectAfterCancel) {
        rejectAfterCancel(err);
      } else {
        reject(err);
      }
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
type TSettledTuple<T extends readonly unknown[]> = { -readonly [K in keyof T]: ISettledResult<Awaited<T[K]>> };

type ICancAwaitAll = <T extends readonly unknown[] | []>(
  values: readonly [...T],
  options?: ICancelablePromiseOptions,
) => Generator<CancelablePromise<TAwaitedTuple<T>, CoFailureOf<T[number]>>, TAwaitedTuple<T>, TAwaitedTuple<T>>;

type ICancAwaitRace = <T extends readonly unknown[] | []>(
  values: readonly [...T],
  options?: ICancelablePromiseOptions,
) => Generator<CancelablePromise<Awaited<T[number]>, CoFailureOf<T[number]>>, Awaited<T[number]>, Awaited<T[number]>>;

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
) => Generator<CancelablePromise<Awaited<T>, CoFailureOf<T>>, Awaited<T>, Awaited<T>>;

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
  next(): Generator<Failing<never>, void, any>;
  /** Ends the iteration and finishes source cleanup at this point. Delegate it with `yield*`. */
  return(): Generator<Failing<never>, void, any>;
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
  <T>(source: TEachSource<T>): Generator<Failing<never>, ICancForAwaitLoop<T>, any>;
  <T>(source: TEachSource<T>, cb: TForAwaitCallback<T>): Generator<Failing<BreakError>, void, any>;
  /** Collects elements into an array. */
  toArray<T>(source: TEachSource<T>): Generator<Failing<BreakError>, T[], any>;
  /** Advances the innermost open forAwait loop. Delegate it with `yield*`. */
  next(): Generator<Failing<never>, void, any>;
}

interface ICancAwait {
  <T>(value: T): Generator<Failing<CoFailureOf<T>>, Awaited<T>, any>;
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

interface ILoopRegistry extends Array<ILoopHandle> {
  _entries: number;
  _pendingCleanups?: Array<PromiseLike<void>>;
}

interface ILoopHandle extends ICancForAwaitLoop<any> {
  _it: any;
  _async: boolean;
  _current: IteratorResult<any>;
  _stale: boolean;
  _used: boolean;
  _finished: boolean;
  _disposing: boolean;
  _enteredAt: number;
  _registry: ILoopRegistry | undefined;
  _disposed: PromiseLike<void> | undefined;
}

// Closes the source once, and what lands on `_disposed` is safe to await bare because
// `returnStepIterator` has already neutralized a rejecting `return()`
function disposeLoop(loop: ILoopHandle): PromiseLike<void> | undefined {
  if (!loop._disposing) {
    loop._disposing = true;
    loop._finished = true;
    // final turn relies on this to avoid throwing IterationError on exhaustion
    loop._stale = false;

    const cleanup = returnStepIterator(loop._it);
    loop._disposed = isThenable(cleanup) ? (cleanup as PromiseLike<void>) : undefined;
  }

  return loop._disposed;
}

function registerLoopHandle(loop: ILoopHandle, registry: ILoopRegistry): void {
  loop._registry = registry;
  registry.push(loop);
}

// pending close moves to settle list
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
  registry: ILoopRegistry,
  options: TFlagOptions,
  settle: (value?: any) => void,
  value?: any,
): void {
  const pending = registry.splice(0, registry.length);
  const pendingCleanups = registry._pendingCleanups || [];
  registry._pendingCleanups = undefined;

  if (pending.length === 0 && pendingCleanups.length === 0) {
    settle(value);

    return;
  }

  const cleanups: Array<PromiseLike<void>> = [];

  for (const loop of pending) {
    const cleanup = disposeLoop(loop);

    if (cleanup) {
      cleanups.push(cleanup);
    }
  }

  cleanups.push(...pendingCleanups);

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
      loop._enteredAt = loop._registry ? ++loop._registry._entries : 0;

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
          const cleanup = disposeLoop(loop);
          const registry = loop._registry;

          if (cleanup && registry) {
            // pending close moves to settle list so finishCleanups still awaits it
            (registry._pendingCleanups ||= []).push(cleanup);
          }

          unregisterLoop(loop);

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
  // stays set only when the driver returned into the loop, the one case that must re-return
  let returning = true;

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
        isGenerator(outcome) ? yield* delegateUnwinding(outcome, RETURN_UNWIND)
        : isThenable(outcome) ? yield outcome
        : outcome;

      if (settled === false) {
        break;
      }
    }
    returning = false;
  } catch (err) {
    returning = false;
    if (!isBreakError(err)) {
      throw err;
    }
  } finally {
    yield returnStepIterator(it);
    if (returning) {
      yield RETURN_UNWIND;
    }
  }
} as ICancForAwait;

cancForAwait.toArray = function* toArray(source: any): Generator<unknown, any[], any> {
  const { it, async } = getStepIterator(source);
  const collected: any[] = [];
  let returning = true;

  try {
    while (true) {
      const result: IteratorResult<any> = async ? yield it.next() : it.next();

      if (result.done) {
        break;
      }

      collected.push(async ? result.value : yield result.value);
    }
    returning = false;
  } catch (err) {
    returning = false;
    throw err;
  } finally {
    yield returnStepIterator(it);
    if (returning) {
      yield RETURN_UNWIND;
    }
  }

  return collected;
} as ICancForAwait['toArray'];

cancForAwait.next = function* next(): Generator<unknown, void, any> {
  const loop = yield { [CURRENT_LOOP]: true };
  if (!isObject(loop) || !isObject((loop as any)._it)) {
    throw new IterationError('No active forAwait loop; canc.forAwait.next() requires a loop in the body');
  }
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
