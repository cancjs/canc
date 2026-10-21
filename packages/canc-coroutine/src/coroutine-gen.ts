import {
  AggregateError,
  CancelablePromise,
  CancelError,
  Failing,
  FAILURE,
  ICancelablePromiseOptions,
  isCancelError,
  ISettledResult,
} from '@cancjs/promise';

import {
  assertGeneratorResult,
  assertStepResult,
  isFunction,
  isGenerator,
  isObject,
  isThenable,
  setFnName,
} from '../../_util';
import {
  BreakError,
  delegateUnwinding,
  forwardCancel,
  getStepIterator,
  IGeneratorLikeFn,
  isBreakError,
  returnStepIterator,
  TEachSource,
  TForAwaitCallback,
  TGeneratorLike,
} from './coroutine';
import type { CoFailureOf } from './step-failure';

export type TYieldTransformFn<T = any> = (value: any, awaited: <U>(v: U) => TAwaited<U>) => T;

export type TCancelableCoroutineGenOptions = ICancelablePromiseOptions & {
  transformYield?: TYieldTransformFn;
  displayName?: string;
};

const genMethods = ['next', 'throw', 'return'] as const;

// a helper the consumer returned into yields this once its cleanup ran, so the driver returns again
const GEN_RETURN_UNWIND = Symbol.for('@cancjs/coroutine:genReturnUnwind');

// a cancel landing on a shielded step waits for it, then unwinds at the next unshielded step
function isShieldedStep(value: unknown): boolean {
  return isThenable(value) && (value as { shield?: unknown }).shield === true;
}

function isSignalAborted(signal: ICancelablePromiseOptions['signal']): boolean {
  if (!signal) {
    return false;
  }

  const signals = Array.isArray(signal) ? signal : [signal];

  for (const sig of signals) {
    if (sig.aborted) {
      return true;
    }
  }

  return false;
}

type TAbortSignal = NonNullable<ICancelablePromiseOptions['signal']>;

function subscribeAbort(signal: TAbortSignal, onAbort: (reason: any) => void): () => void {
  const signals = Array.isArray(signal) ? signal : [signal];
  const listeners: Array<() => void> = [];

  for (const sig of signals) {
    const listener = () => {
      onAbort(sig.reason);
    };
    listeners.push(listener);
    sig.addEventListener('abort', listener, { once: true });
  }

  return () => {
    for (let i = 0; i < signals.length; i++) {
      signals[i].removeEventListener('abort', listeners[i], { once: true });
    }
  };
}

// cross-copy members of a promise copy that counts consumers without a child promise
interface ICountedSource {
  _subscribe(onFulfilled: (value: any) => unknown, onRejected: (reason: any) => unknown): void;
  _retainRef(): (() => void) | undefined;
}

type TGeneratorMethod = (typeof genMethods)[number];

type TResolveFn = (value: IteratorResult<any, any>) => void;
type TRejectFn = (reason?: any) => void;

interface TAsyncGeneratorStep {
  method: TGeneratorMethod;
  value: any;
  resolve: TResolveFn;
  reject: TRejectFn;
  promise: CancelablePromise<any, any> | undefined;
  next: TAsyncGeneratorStep | null;
}

interface IGenCall {
  threw: boolean;
  result: IteratorResult<any, any> | undefined;
  error: any;
}

// `awaited(value)` marks a yielded value as an internal await without emitting it.
// A plain `yield value` is an emitted value surfacing as `{ value }` to the consumer,
// mirroring native async generators where `yield x` emits and `await x` does not.
const awaitedSymbol = Symbol.for('@cancjs/coroutine:awaited');

interface TAwaited<T = any> {
  [awaitedSymbol]: T;
}

const isAwaited = (value: any): value is TAwaited => isObject(value) && awaitedSymbol in value;

const awaited = <T = any>(value: T | TAwaited<T>): TAwaited<T> => ({
  [awaitedSymbol]: isAwaited(value) ? value[awaitedSymbol] : value,
});

type TGenAwaitedTuple<T extends readonly unknown[]> = { -readonly [K in keyof T]: Awaited<T[K]> };
type TGenSettledTuple<T extends readonly unknown[]> = { -readonly [K in keyof T]: ISettledResult<Awaited<T[K]>> };

type ICancGenAwaitAll = <T extends readonly unknown[] | []>(
  values: readonly [...T],
  options?: ICancelablePromiseOptions,
) => Generator<
  TAwaited<TGenAwaitedTuple<T>> & Failing<CoFailureOf<T[number]>>,
  TGenAwaitedTuple<T>,
  TGenAwaitedTuple<T>
>;

type ICancGenAwaitRace = <T extends readonly unknown[] | []>(
  values: readonly [...T],
  options?: ICancelablePromiseOptions,
) => Generator<TAwaited<Awaited<T[number]>> & Failing<CoFailureOf<T[number]>>, Awaited<T[number]>, Awaited<T[number]>>;

type ICancGenAwaitAny = <T extends readonly unknown[] | []>(
  values: readonly [...T],
  options?: ICancelablePromiseOptions,
) => Generator<TAwaited<Awaited<T[number]>> & Failing<AggregateError>, Awaited<T[number]>, Awaited<T[number]>>;

type ICancGenAwaitAllSettled = <T extends readonly unknown[] | []>(
  values: readonly [...T],
  options?: ICancelablePromiseOptions,
) => Generator<TAwaited<TGenSettledTuple<T>> & Failing<never>, TGenSettledTuple<T>, TGenSettledTuple<T>>;

type ICancGenAwaitTry = <T, TArgs extends any[]>(
  fn: (...args: TArgs) => T | PromiseLike<T>,
  ...args: TArgs
) => Generator<TAwaited<Awaited<T>> & Failing<CoFailureOf<T>>, Awaited<T>, Awaited<T>>;

/**
 * Internal await inside a `cancGenAsync` body: suspend on `value`, resume with its resolution, typed
 * via `yield*` (delegate `TReturn`), unlike the un-typeable bare `yield`. Wraps the value in the
 * `awaited` marker so the driver treats it as an internal await, NOT an emit. Mirror of `cancAwait`
 * for the `async *` world (`cancGen.await`), including the same `.all/.race/.any/.allSettled/.try`
 * combinator surface below.
 *
 * const n = yield* cancGenAwait(Promise.resolve(1)); // n: number, no cast
 */
export interface ICancGenAwait {
  <T>(value: T): Generator<TAwaited<Awaited<T>> & Failing<CoFailureOf<T>>, Awaited<T>, any>;
  all: ICancGenAwaitAll;
  race: ICancGenAwaitRace;
  any: ICancGenAwaitAny;
  allSettled: ICancGenAwaitAllSettled;
  try: ICancGenAwaitTry;
}

function cancGenAwaitImpl<T>(value: Promise<T> | T): Generator<TAwaited<Awaited<T>>, Awaited<T>, Awaited<T>> {
  return (function* (): Generator<TAwaited<Awaited<T>>, Awaited<T>, Awaited<T>> {
    return yield awaited(value) as TAwaited<Awaited<T>>;
  })();
}

function makeGenCombinator(build: (...args: any[]) => CancelablePromise<any, any>) {
  return function* (...args: any[]): Generator<TAwaited<any>, any, any> {
    return yield awaited(build(...args));
  };
}

export const cancGenAwait = cancGenAwaitImpl as ICancGenAwait;

cancGenAwait.all = makeGenCombinator(CancelablePromise.all.bind(CancelablePromise)) as ICancGenAwait['all'];
cancGenAwait.race = makeGenCombinator(CancelablePromise.race.bind(CancelablePromise)) as ICancGenAwait['race'];
cancGenAwait.any = makeGenCombinator(CancelablePromise.any.bind(CancelablePromise)) as ICancGenAwait['any'];
cancGenAwait.allSettled = makeGenCombinator(
  CancelablePromise.allSettled.bind(CancelablePromise),
) as ICancGenAwait['allSettled'];
cancGenAwait.try = makeGenCombinator(CancelablePromise.try.bind(CancelablePromise)) as ICancGenAwait['try'];

/**
 * `throw`, as a yieldable step in the async-generator dialect (`cancGen.throw`). Runtime: a generator
 * that throws on its first `next()`, so `yield*` propagates it at the call site and ordinary
 * try/catch/finally behaves exactly as with a bare `throw`. The yield type carries `Failing<TFailure>`
 * intersected with `TAwaited<never>` so the `cancGenAsync` emit filter `Exclude<TYield, TAwaited<any>>`
 * strips it from the consumer-facing emit type.
 */
export function cancGenThrow<TFailure>(error: TFailure): Generator<TAwaited<never> & Failing<TFailure>, never, any> {
  return (function* (): Generator<TAwaited<never> & Failing<TFailure>, never, any> {
    throw error;
  })();
}

/**
 * Body annotation for a `cancGenAsync` generator. `E` = emit type (what the consumer's `for await`
 * sees); `R` = final return. The `| TAwaited<any>` admits `yield* cancGenAwait(...)` internal awaits;
 * the `cancGenAsync` signature strips the marker from the consumer-facing emit type. Mirror of
 * `AsyncResult`. Optional: for a body that only `yield`s emits and `yield*`s `cancGenAwait`, `E` and
 * `R` infer from the body. Annotate for explicitness or to pin a bare `yield`'s type.
 */
export type AsyncGenResult<TEmit, TReturn = void, TFailure = unknown> = Generator<
  TEmit | (unknown extends TFailure ? TAwaited<any> : TAwaited<any> & Failing<TFailure>),
  TReturn,
  any
>;

export interface ICancAsyncGenerator<T, TReturn = any, TNext = any, TFailure = never> extends AsyncGenerator<
  T,
  TReturn,
  TNext
> {
  readonly [FAILURE]?: TFailure;
}

/**
 * Wraps a generator function into an async generator whose yielded values are emitted and internal awaits are consumed.
 *
 * Emits values yielded directly, while values yielded via `cancGenAwait` or internal helpers are
 * awaited within the generator and not emitted to consumers. Canceling an in-flight iteration step
 * cancels the generator and executes enclosing `finally` blocks.
 *
 * @param genFn Generator function defining the async generator body.
 * @param options Async generator and promise execution options.
 */
export function cancGenAsync<TYield, TReturn, TArgs extends any[], TThis = any>(
  genFn: (this: TThis, ...args: TArgs) => Generator<TYield, TReturn, any>,
  options?: TCancelableCoroutineGenOptions,
): (
  this: TThis,
  ...args: TArgs
) => ICancAsyncGenerator<Exclude<TYield, TAwaited<any>>, TReturn, any, CoFailureOf<TYield>>;
export function cancGenAsync(
  genFn: IGeneratorLikeFn,
  options?: TCancelableCoroutineGenOptions,
): (...args: any[]) => ICancAsyncGenerator<any, any>;
export function cancGenAsync(genFn: IGeneratorLikeFn, options: TCancelableCoroutineGenOptions = {}) {
  if (!isFunction(genFn)) {
    throw new TypeError('Argument is not a function');
  }

  setFnName(coroutineGenWrapper, 'coroutineGen', genFn, options?.displayName);

  const { transformYield, displayName: _displayName, ...promiseOptions } = options;
  const { signal, ...stepOptions } = promiseOptions;
  const shieldOptions: ICancelablePromiseOptions = { ...stepOptions, shield: true };

  function coroutineGenWrapper(this: any, ...args: any[]) {
    // an already aborted signal cancels every step at birth, so the body is never created
    const bornCanceled = isSignalAborted(signal);
    const gen: TGeneratorLike | undefined = bornCanceled ? undefined : genFn.apply(this, args);
    let bodyError: TypeError | undefined;

    if (gen !== undefined) {
      try {
        assertGeneratorResult(gen, 'A coroutine generator body must be a generator function');
      } catch (error) {
        bodyError = error as TypeError;
      }
    }

    let currentStep: TAsyncGeneratorStep | null = null;
    let queuedStep: TAsyncGeneratorStep | null = null;
    let done = bornCanceled || bodyError !== undefined;
    // Distinct from `done` (which is also true on normal completion): set only by a cancel, so a
    // source that settles AFTER cancel can be dropped instead of driving the (torn-down) generator.
    let canceled = false;
    let drained = false;
    let cancelReason: any;
    let cancelDisposing = false;
    // the step whose cancel started the unwind receives a cleanup error
    let canceledStep: TAsyncGeneratorStep | undefined;
    let drain: { promise: CancelablePromise<any, any>; resolve: (value?: any) => void } | undefined;
    // the generator is on the stack, so a cancel only marks and the running call unwinds after it
    let executing = false;
    let pendingSource: CancelablePromise<any, any> | undefined;
    // counted consumer ref on a yielded shared source, released instead of canceling it
    let releaseStepSource: (() => void) | undefined;
    // cancel accepted mid shielded step: body runs on to its next unshielded step
    let cancelDeferred = false;
    let pendingShielded = false;
    // a consumer return() runs the finally blocks, a cancel waits for them like for a shielded step
    let returning = false;
    // value of the consumer return() in flight, handed back when a helper asks to return again
    let returnValue: any;
    let unsubscribe: (() => void) | undefined;

    const asyncGen = {
      [Symbol.asyncIterator]() {
        return this;
      },
    } as ICancAsyncGenerator<any, any>;

    for (const method of genMethods) {
      asyncGen[method] = (value?: any): CancelablePromise<any, any> => {
        try {
          return createStep(method, value);
        } catch (err) {
          // a strict pre-aborted signal throws at construction, the caller still gets a promise
          return CancelablePromise.reject(err);
        }
      };
    }

    // one subscription per generator, so an abort between pulls still unwinds the body
    if (!done && signal) {
      unsubscribe = subscribeAbort(signal, (reason) => {
        cancelGen(reason, undefined, false);
      });
    }

    function stopListening() {
      const off = unsubscribe;
      unsubscribe = undefined;
      if (off) {
        off();
      }
    }

    function createStep(method: TGeneratorMethod, value: any): CancelablePromise<any, any> {
      // after an abort a new step is born canceled by the signal itself
      const aborted = isSignalAborted(signal);
      let step: TAsyncGeneratorStep | undefined;
      const promise = new CancelablePromise<any, any>(
        (resolve, reject, { handleCancel }) => {
          const created: TAsyncGeneratorStep = {
            method,
            value,
            resolve: resolve as TResolveFn,
            reject,
            promise: undefined,
            next: null,
          };
          step = created;
          // a cancel that skips the step's own cancel(), a bubble for one
          handleCancel((reason?: any) => cancelGen(reason, created, false));
        },
        aborted ? promiseOptions : stepOptions,
      );

      if (step === undefined || !promise.cancelable) {
        return promise;
      }

      const own = step;
      own.promise = promise;
      // the step stays pending while the body unwinds, like the cancAsync coroutine promise
      promise.cancel = function (reason?: any, _disposing?: boolean): any {
        if (canceled && !drained) {
          return promise.asyncCancel ? drain!.promise : undefined;
        }

        if (done || promise.shield || !promise.cancelable) {
          return CancelablePromise.prototype.cancel.call(promise, reason, _disposing);
        }

        const unwound = cancelGen(reason, own, _disposing === true);

        return promise.asyncCancel ? unwound : undefined;
      };

      if (queuedStep) {
        queuedStep.next = own;
        queuedStep = own;
      } else {
        queuedStep = own;
        currentStep = own;

        resume(method, value);
      }

      return promise;
    }

    function callGen(method: TGeneratorMethod, sentValue: any): IGenCall {
      executing = true;
      try {
        const result = gen![method](sentValue);
        assertStepResult(result, 'A coroutine generator body produced an invalid step');
        return { threw: false, result, error: undefined };
      } catch (error) {
        return { threw: true, result: undefined, error };
      } finally {
        executing = false;
      }
    }

    function resume(method: TGeneratorMethod, sentValue: any) {
      if (bodyError !== undefined) {
        const error = bodyError;
        bodyError = undefined;
        settle('throw', error);
        return;
      }

      if (done) {
        // Generator already finished/returned; any residual step just reports completion.
        settle('return', undefined);
        return;
      }

      if (method === 'return') {
        returnValue = sentValue;
        returning = true;
      }

      const call = callGen(method, sentValue);

      if (canceled) {
        // canceled while the body ran: the cancel left the unwind to this call
        if (call.threw) {
          finishDrain(true, call.error);
        } else {
          unwind();
        }
        return;
      }

      if (call.threw) {
        done = true;
        stopListening();
        settle('throw', call.error);
        return;
      }

      const result = call.result!;

      if (!result.done && result.value === GEN_RETURN_UNWIND) {
        resume('return', returnValue);
        return;
      }

      if (result.done) {
        done = true;
        stopListening();
      }

      const rawValue = transformYield ? transformYield(result.value, awaited) : result.value;
      const isAwaitedValue = isAwaited(rawValue);
      const settledValue = isAwaitedValue ? rawValue[awaitedSymbol] : rawValue;

      if (result.done) {
        pendingSource = CancelablePromise.resolve(settledValue);
        pendingSource.then(
          (value) => {
            if (canceled) return;
            pendingSource = undefined;
            settle('return', value);
          },
          (error) => {
            if (canceled) return;
            pendingSource = undefined;
            settle('throw', error);
          },
        );
        return;
      }

      if (isAwaitedValue) {
        awaitStep(settledValue);
      } else {
        // Plain yield: emit to the consumer as `{ value, done: false }`.
        settle('next', settledValue);
      }
    }

    function awaitStep(settledValue: any): boolean {
      const shielded = returning || isShieldedStep(settledValue);
      const onSettled = (method: TGeneratorMethod, value: any) => {
        if (!canceled) {
          clearStepSource();
          resume(method, value);
        } else if (shielded && cancelDeferred) {
          clearStepSource();
          resumeDeferred(method, value);
        }
      };
      const onFulfilled = (value: any) => onSettled('next', value);
      const onRejected = (error: any) => onSettled('throw', error);

      pendingShielded = shielded;

      if (settledValue instanceof CancelablePromise && settledValue.constructor === CancelablePromise) {
        const counted = settledValue as unknown as Partial<ICountedSource>;
        if (typeof counted._retainRef === 'function' && typeof counted._subscribe === 'function') {
          // a shared source stops only once its last consumer is gone
          counted._subscribe(onFulfilled, onRejected);
          releaseStepSource = counted._retainRef();
          return shielded;
        }
      }

      // a copy without counted refs, or a private wrapper: the unwind cancels it directly
      const source = CancelablePromise.resolve(settledValue);
      pendingSource = source;
      source.then(onFulfilled, onRejected);
      return shielded;
    }

    function clearStepSource() {
      pendingSource = undefined;
      releaseStepSource = undefined;
      pendingShielded = false;
    }

    // Drives the body after a deferred cancel: shielded awaits keep running, anything else unwinds
    function resumeDeferred(method: TGeneratorMethod, sentValue: any) {
      const call = callGen(method, sentValue);

      if (call.threw) {
        cancelDeferred = false;
        finishDrain(true, call.error);
        return;
      }

      const result = call.result!;

      if (result.done) {
        cancelDeferred = false;
        finishDrain(false, undefined);
        return;
      }

      const rawValue = transformYield ? transformYield(result.value, awaited) : result.value;
      if (isAwaited(rawValue) && awaitStep(rawValue[awaitedSymbol])) {
        return;
      }

      cancelDeferred = false;
      unwind();
    }

    function settle(type: TGeneratorMethod, value: any) {
      const step = currentStep;

      if (!step) {
        return;
      }

      if (type === 'return') {
        step.resolve({ value, done: true });
      } else if (type === 'throw') {
        step.reject(value);
      } else {
        step.resolve({ value, done: false });
      }

      currentStep = step.next;

      if (currentStep) {
        resume(currentStep.method, currentStep.value);
      } else {
        queuedStep = null;
      }
    }

    // Stops the in-flight step, then runs the generator's finally blocks to their end
    function unwind() {
      const outstanding = pendingSource;
      const release = releaseStepSource;
      clearStepSource();
      forwardCancel(
        () => {
          if (release) {
            release();
          } else if (outstanding?.cancelable) {
            outstanding.cancel(cancelReason);
          }
        },
        () => pumpDrain('return', undefined),
      );
    }

    // Each finally step runs shielded, so a second cancel never cuts the cleanup short
    function pumpDrain(method: TGeneratorMethod, sentValue: any) {
      let call = callGen(method, sentValue);

      while (!call.threw && !call.result!.done && call.result!.value === GEN_RETURN_UNWIND) {
        call = callGen('return', undefined);
      }

      if (call.threw) {
        finishDrain(true, call.error);
        return;
      }

      const result = call.result!;

      if (result.done) {
        finishDrain(false, undefined);
        return;
      }

      let rawValue: any;
      try {
        rawValue = transformYield ? transformYield(result.value, awaited) : result.value;
      } catch (error) {
        pumpDrain('throw', error);
        return;
      }

      // nobody consumes an emit any more, so it is dropped and the body moves on
      const pending = isAwaited(rawValue) ? rawValue[awaitedSymbol] : undefined;

      CancelablePromise.resolve(pending, shieldOptions).then(
        (value) => pumpDrain('next', value),
        (error) => pumpDrain('throw', error),
      );
    }

    function finishDrain(failed: boolean, error: any) {
      drained = true;
      done = true;
      clearStepSource();

      let step: TAsyncGeneratorStep | null = currentStep || queuedStep;
      currentStep = null;
      queuedStep = null;

      // a cleanup error rejects the canceled step, else the first one still waiting
      let errorTarget: TAsyncGeneratorStep | null = null;
      if (failed) {
        errorTarget = canceledStep?.promise?.cancelable ? canceledStep : step;
      }

      if (errorTarget) {
        errorTarget.reject(error);
      }

      while (step) {
        if (step !== errorTarget) {
          settleCanceled(step);
        }

        step = step.next;
      }

      drain!.resolve();
    }

    // Core cancel settles the step, so handlers get the raw reason like a plain cancel
    function settleCanceled(step: TAsyncGeneratorStep) {
      const promise = step.promise;
      if (!promise?.cancelable) {
        return;
      }

      try {
        (promise as any)._cancel(cancelReason, cancelDisposing);
      } catch {
        // no caller is left to receive a handler error
      }

      if (promise.cancelable) {
        // a shielded step ignores the core cancel, the generator behind it is gone anyway
        step.reject(
          isCancelError(cancelReason) ? cancelReason : (
            new CancelError(typeof cancelReason === 'string' ? cancelReason : 'Canceled')
          ),
        );
      }
    }

    function cancelGen(reason: any, step: TAsyncGeneratorStep | undefined, disposing: boolean) {
      if (canceled) {
        return drain!.promise;
      }

      if (done) {
        return undefined;
      }

      done = true;
      canceled = true;
      cancelReason = reason;
      cancelDisposing = disposing;
      canceledStep = step;
      stopListening();

      const deferred = CancelablePromise.withResolvers<any>({ shield: true });
      drain = { promise: deferred.promise, resolve: deferred.resolve as (value?: any) => void };

      // a cancel cascade waits for this cleanup too
      const collector = (CancelablePromise as any)._activeCollector as any[] | undefined;
      if (collector) {
        collector.push(deferred.promise);
      }

      if (executing) {
        return drain.promise;
      }

      if (pendingShielded) {
        cancelDeferred = true;
      } else {
        unwind();
      }

      return drain.promise;
    }

    return asyncGen;
  }

  return coroutineGenWrapper;
}

interface ICancGenForAwait {
  <T>(source: TEachSource<T>, cb: TForAwaitCallback<T>): Generator<TAwaited<any> & Failing<BreakError>, void, any>;
  /** Collects elements into an array. */
  toArray<T>(source: TEachSource<T>): Generator<TAwaited<any> & Failing<BreakError>, T[], any>;
}

/**
 * Consumes an iterable inside a `cancGenAsync` producer body without emitting pulls to the outer consumer.
 *
 * Each item of `source` is pulled at an internal cancellation point and passed to `cb`. The callback
 * supports three forms: a sync return, a generator (delegated with `yield*`), or a `cancAsync`
 * coroutine returning a `CancelablePromise`. Returning `false` or throwing `BreakError` stops the
 * loop cleanly. Plain `async` callbacks returning native promises are intentionally not
 * type-supported to steer callers toward cancelable operations, though the runtime dispatches any
 * thenable. Use `cancGenForAwait.toArray` to collect elements into an array instead.
 */
export const cancGenForAwait = function* cancGenForAwait(
  source: any,
  cb: (value: any, index: number) => any,
): Generator<unknown, void, any> {
  const { it, async: isAsync } = getStepIterator(source);
  let index = 0;
  // stays set only when the consumer returned into the loop, the one case that must re-return
  let returning = true;

  try {
    while (true) {
      const result: IteratorResult<any> = yield awaited(it.next());

      if (result.done) {
        break;
      }

      const value = isAsync ? result.value : yield awaited(result.value);

      const outcome = cb(value, index++);
      let settled: void | false;

      if (isGenerator(outcome)) {
        // bare-generator cb: delegate, its cancGenAwait steps run on the driver
        settled = yield* delegateUnwinding(outcome as Generator<unknown, void | false, any>, GEN_RETURN_UNWIND);
      } else if (isThenable(outcome)) {
        settled = yield awaited(outcome); // cancAsync-coroutine cb (CancelablePromise): marker pull
      } else {
        settled = outcome; // sync cb
      }

      if (settled === false) {
        break;
      }
    }
    returning = false;
  } catch (error) {
    returning = false;
    if (!isBreakError(error)) {
      throw error;
    }
  } finally {
    yield awaited(returnStepIterator(it));
    if (returning) {
      yield GEN_RETURN_UNWIND;
    }
  }
} as unknown as ICancGenForAwait;

cancGenForAwait.toArray = function* toArray(source: any): Generator<unknown, any[], any> {
  const { it, async: isAsync } = getStepIterator(source);
  const collected: any[] = [];
  let returning = true;

  try {
    while (true) {
      const result: IteratorResult<any> = yield awaited(it.next());

      if (result.done) {
        break;
      }

      collected.push(isAsync ? result.value : yield awaited(result.value));
    }
    returning = false;
  } catch (error) {
    returning = false;
    throw error;
  } finally {
    yield awaited(returnStepIterator(it));
    if (returning) {
      yield GEN_RETURN_UNWIND;
    }
  }

  return collected;
} as unknown as ICancGenForAwait['toArray'];

/**
 * Re-emit a sub async-iterable from inside a `cancGenAsync` producer (`cancGen.delegate`): the
 * `yield* subAsyncGen` analog. Pulls each item of `source` INTERNALLY (marker-wrapped) and EMITs it to
 * OUR consumer via a bare `yield`. A separate helper because it is delegation, not a `for await` (no
 * per-item body). Direct `yield* source` cannot work: a sync producer generator cannot `yield*` an
 * async iterable. Like `yield*`, a value the consumer sends with `next(value)` and an error it sends
 * with `throw(error)` reach `source`, and the return value of `source` becomes the result of the
 * delegation.
 */
export function cancGenDelegate<T>(
  source: TEachSource<T>,
): Generator<T | (TAwaited<any> & Failing<BreakError>), void, any>;
export function cancGenDelegate<T>(source: TEachSource<T>): Generator<unknown, any, any> {
  return (function* (): Generator<unknown, any, any> {
    const { it, async: isAsync } = getStepIterator(source);
    const inner = it as Partial<Iterator<unknown>> & { next(value?: any): any };
    let returning = true;
    // a source that finished or threw is closed already and is not returned again
    let open = true;
    let pull: () => any = () => inner.next();

    try {
      while (true) {
        let stepResult: IteratorResult<any>;
        try {
          stepResult = yield awaited(pull()); // internal marker pull
        } catch (error) {
          open = false;
          throw error;
        }

        if (stepResult.done) {
          open = false;
          returning = false;
          return isAsync ? stepResult.value : yield awaited(stepResult.value);
        }

        const item = isAsync ? stepResult.value : yield awaited(stepResult.value);

        try {
          const sent = yield item; // BARE = emit to our consumer
          pull = () => inner.next(sent);
        } catch (error) {
          if (!isFunction(inner.throw)) {
            throw error;
          }
          const throwInto = inner.throw;
          pull = () => throwInto.call(inner, error);
        }
      }
    } catch (error) {
      returning = false;
      throw error;
    } finally {
      if (open) {
        yield awaited(returnStepIterator(it));
      }
      if (returning) {
        yield GEN_RETURN_UNWIND;
      }
    }
  })();
}
