import {
  AggregateError,
  CancelablePromise,
  CancelError,
  Failing,
  FAILURE,
  FailureOf,
  ICancelablePromiseOptions,
  isCancelError,
} from '@cancjs/promise';

import { isFunction, isGenerator, isObject, isThenable, setFnName } from '../../_util';
import {
  BreakError,
  getStepIterator,
  IGeneratorLikeFn,
  returnStepIterator,
  TEachSource,
  TForAwaitCallback,
  TGeneratorLike,
} from './coroutine';

export type TYieldTransformFn<T = any> = (value: any, awaited: <U>(v: U) => TAwaited<U>) => T;

export type TCancelableCoroutineGenOptions = ICancelablePromiseOptions & {
  transformYield?: TYieldTransformFn;
  displayName?: string;
};

const genMethods = ['next', 'throw', 'return'] as const;

type TGeneratorMethod = (typeof genMethods)[number];

type TResolveFn = (value: IteratorResult<any, any>) => void;
type TRejectFn = (reason?: any) => void;

interface TAsyncGeneratorStep {
  method: TGeneratorMethod;
  value: any;
  resolve: TResolveFn;
  reject: TRejectFn;
  next: TAsyncGeneratorStep | null;
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
type TGenSettledTuple<T extends readonly unknown[]> = { -readonly [K in keyof T]: PromiseSettledResult<Awaited<T[K]>> };

type ICancGenAwaitAll = <T extends readonly unknown[] | []>(
  values: readonly [...T],
  options?: ICancelablePromiseOptions,
) => Generator<TAwaited<TGenAwaitedTuple<T>> & Failing<FailureOf<T[number]>>, TGenAwaitedTuple<T>, TGenAwaitedTuple<T>>;

type ICancGenAwaitRace = <T extends readonly unknown[] | []>(
  values: readonly [...T],
  options?: ICancelablePromiseOptions,
) => Generator<TAwaited<Awaited<T[number]>> & Failing<FailureOf<T[number]>>, Awaited<T[number]>, Awaited<T[number]>>;

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
) => Generator<TAwaited<Awaited<T>> & Failing<FailureOf<T>>, Awaited<T>, Awaited<T>>;

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
  <T>(value: T): Generator<TAwaited<Awaited<T>> & Failing<FailureOf<T>>, Awaited<T>, any>;
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
) => ICancAsyncGenerator<Exclude<TYield, TAwaited<any>>, TReturn, any, FailureOf<TYield>>;
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

  function coroutineGenWrapper(this: any, ...args: any[]) {
    const gen: TGeneratorLike = genFn.apply(this, args);

    let currentStep: TAsyncGeneratorStep | null = null;
    let queuedStep: TAsyncGeneratorStep | null = null;
    let done = false;
    // Distinct from `done` (which is also true on normal completion): set only by a cancel, so a
    // source that settles AFTER cancel can be dropped instead of driving the (torn-down) generator.
    let canceled = false;
    let pendingSource: CancelablePromise<any, any> | undefined;

    const asyncGen = {
      [Symbol.asyncIterator]() {
        return this;
      },
    } as ICancAsyncGenerator<any, any>;

    for (const method of genMethods) {
      asyncGen[method] = (value?: any): CancelablePromise<any, any> => {
        return new CancelablePromise((resolve, reject, { handleCancel }) => {
          const step: TAsyncGeneratorStep = {
            method,
            value,
            resolve: resolve as TResolveFn,
            reject,
            next: null,
          };

          // If this exact step's returned promise is canceled, cancel the whole iterator:
          // return the generator (runs its `finally` blocks) and drain every queued request
          // with a CancelError, matching the two-way propagation contract.
          handleCancel((reason?: any) => {
            cancelIterator(step, reason);
          });

          if (queuedStep) {
            queuedStep.next = step;
            queuedStep = step;
          } else {
            queuedStep = step;
            currentStep = step;

            resume(method, value);
          }
        }, promiseOptions);
      };
    }

    function resume(method: TGeneratorMethod, sentValue: any) {
      if (done) {
        // Generator already finished/returned; any residual step just reports completion.
        settle('return', undefined);
        return;
      }

      let result: IteratorResult<any, any>;

      try {
        result = gen[method](sentValue);
      } catch (error) {
        done = true;
        settle('throw', error);
        return;
      }

      if (result.done) {
        done = true;
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
        pendingSource = CancelablePromise.resolve(settledValue);
        pendingSource.then(
          (value) => {
            if (canceled) return;
            pendingSource = undefined;
            resume('next', value);
          },
          (error) => {
            if (canceled) return;
            pendingSource = undefined;
            resume('throw', error);
          },
        );
      } else {
        // Plain yield: emit to the consumer as `{ value, done: false }`.
        settle('next', settledValue);
      }
    }

    function settle(type: TGeneratorMethod, value: any) {
      const step = currentStep!;

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

    function cancelIterator(canceledStep: TAsyncGeneratorStep, reason?: any) {
      if (done) {
        return;
      }

      done = true;
      canceled = true;

      const outstanding = pendingSource;
      pendingSource = undefined;
      if (outstanding?.cancelable) {
        outstanding.cancel(reason);
      }

      // Run the generator's cleanup (`finally` blocks) synchronously.
      try {
        gen.return(undefined);
      } catch {
        // swallow cleanup errors so cancellation still proceeds
      }

      const cancelError =
        isCancelError(reason) ? reason : new CancelError(typeof reason === 'string' ? reason : 'Canceled');

      let step: TAsyncGeneratorStep | null = currentStep || queuedStep;

      while (step) {
        if (step !== canceledStep) {
          step.reject(cancelError);
        }

        step = step.next;
      }

      currentStep = null;
      queuedStep = null;
    }

    return asyncGen;
  }

  return coroutineGenWrapper;
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
interface ICancGenForAwait {
  <T>(source: TEachSource<T>, cb: TForAwaitCallback<T>): Generator<TAwaited<any> & Failing<BreakError>, void, any>;
  toArray<T>(source: TEachSource<T>): Generator<TAwaited<any> & Failing<BreakError>, T[], any>;
}

/**
 * Consumes an iterable inside a `cancGenAsync` producer body without emitting pulls to the outer consumer.
 */
export const cancGenForAwait = function* cancGenForAwait(
  source: any,
  cb: (value: any, index: number) => any,
): Generator<TAwaited<any>, void, any> {
  const { it, async: isAsync } = getStepIterator(source);
  let index = 0;

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
        settled = yield* outcome as Generator<TAwaited<any>, void, any>;
      } else if (isThenable(outcome)) {
        settled = yield awaited(outcome); // cancAsync-coroutine cb (CancelablePromise): marker pull
      } else {
        settled = outcome; // sync cb
      }

      if (settled === false) {
        break;
      }
    }
  } finally {
    yield awaited(returnStepIterator(it));
  }
} as unknown as ICancGenForAwait;

cancGenForAwait.toArray = function* toArray(source: any): Generator<TAwaited<any>, any[], any> {
  const { it, async: isAsync } = getStepIterator(source);
  const collected: any[] = [];

  try {
    while (true) {
      const result: IteratorResult<any> = yield awaited(it.next());

      if (result.done) {
        break;
      }

      collected.push(isAsync ? result.value : yield awaited(result.value));
    }
  } finally {
    yield awaited(returnStepIterator(it));
  }

  return collected;
} as unknown as ICancGenForAwait['toArray'];

/**
 * Re-emit a sub async-iterable from inside a `cancGenAsync` producer (`cancGen.delegate`): the
 * `yield* subAsyncGen` analog. Pulls each item of `source` INTERNALLY (marker-wrapped) and EMITs it to
 * OUR consumer via a bare `yield`. A separate helper because it is delegation, not a `for await` (no
 * per-item body). Direct `yield* source` cannot work: a sync producer generator cannot `yield*` an
 * async iterable.
 */
export function cancGenDelegate<T>(
  source: TEachSource<T>,
): Generator<T | (TAwaited<any> & Failing<BreakError>), void, any>;
export function cancGenDelegate<T>(source: TEachSource<T>): Generator<T | TAwaited<any>, void, any> {
  return (function* (): Generator<T | TAwaited<any>, void, any> {
    const { it, async: isAsync } = getStepIterator(source);

    try {
      while (true) {
        const stepResult: IteratorResult<any> = yield awaited(it.next()); // internal marker pull
        if (stepResult.done) break;
        const item = isAsync ? stepResult.value : yield awaited(stepResult.value);
        yield item; // BARE = emit to our consumer
      }
    } finally {
      yield awaited(returnStepIterator(it));
    }
  })();
}
