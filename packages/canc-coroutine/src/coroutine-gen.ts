import { CancelablePromise, CancelError, ICancelablePromiseOptions } from '@cancjs/promise';
import { isFunction, isGenerator, isObject, isThenable } from '../../_util';

import {
 IGeneratorLikeFn,
 TEachSource,
 TForAwaitCallback,
 TGeneratorLike,
 getStepIterator,
 returnStepIterator,
} from './coroutine';

export type TYieldTransformFn<T = any> = (value: any) => T;

export type TCancelableCoroutineGenOptions = ICancelablePromiseOptions & {
 transformYield?: TYieldTransformFn;
};

const genMethods = ['next', 'throw', 'return'] as const;

type TGeneratorMethod = typeof genMethods[number];

type TResolveFn = (value: IteratorResult<any, any>) => void;
type TRejectFn = (reason?: any) => void;

type TAsyncGeneratorStep = {
 method: TGeneratorMethod;
 value: any;
 resolve: TResolveFn;
 reject: TRejectFn;
 next: TAsyncGeneratorStep | null;
};

// `awaited(value)` marks a yielded value as an *internal await* (the coroutine suspends on it but
// does NOT emit it to the async-iterator consumer). A plain `yield value` is an *emitted* value —
// it surfaces as the `{ value }` of the consumer's `.next()` / `for await` loop, mirroring native
// async-generator semantics where every `yield x` yields to the consumer and `await x` does not.
const awaitedSymbol = Symbol.for('@cancjs/coroutine:awaited value');

type TAwaited<T = any> = { [awaitedSymbol]: T };

const isAwaited = (value: any): value is TAwaited => isObject(value) && awaitedSymbol in value;

// Low-level: builds the internal-await marker directly. Kept public only for the `transformYield`
// option, which promotes a plain yielded value to an internal await. Inside a `cancGenAsync` body,
// prefer `yield* cancGenAwait(value)` — it is typed (the resume value flows through `yield*`), while
// a bare `yield awaited(value)` is not.
export const awaited = <T = any>(value: T | TAwaited<T>): TAwaited<T> => ({
 [awaitedSymbol]: isAwaited(value) ? value[awaitedSymbol] : value,
});

// Same tuple/union types as `cancAwait.all/race/any/allSettled/try` (coroutine.ts), re-declared here
// (not imported) since the combinator's RESULT shape is identical between the two worlds and only
// the yielded carrier differs: bare value vs the `awaited(...)` marker.
type TGenAwaitedTuple<T extends readonly unknown[]> = { -readonly [K in keyof T]: Awaited<T[K]> };
type TGenSettledTuple<T extends readonly unknown[]> = { -readonly [K in keyof T]: PromiseSettledResult<Awaited<T[K]>> };

interface ICancGenAwaitAll {
 <T extends readonly unknown[] | []>(
 values: readonly [...T],
 options?: ICancelablePromiseOptions,
 ): Generator<TAwaited<TGenAwaitedTuple<T>>, TGenAwaitedTuple<T>, TGenAwaitedTuple<T>>;
}

interface ICancGenAwaitRace {
 <T extends readonly unknown[] | []>(
 values: readonly [...T],
 options?: ICancelablePromiseOptions,
 ): Generator<TAwaited<Awaited<T[number]>>, Awaited<T[number]>, Awaited<T[number]>>;
}

interface ICancGenAwaitAny {
 <T extends readonly unknown[] | []>(
 values: readonly [...T],
 options?: ICancelablePromiseOptions,
 ): Generator<TAwaited<Awaited<T[number]>>, Awaited<T[number]>, Awaited<T[number]>>;
}

interface ICancGenAwaitAllSettled {
 <T extends readonly unknown[] | []>(
 values: readonly [...T],
 options?: ICancelablePromiseOptions,
 ): Generator<TAwaited<TGenSettledTuple<T>>, TGenSettledTuple<T>, TGenSettledTuple<T>>;
}

interface ICancGenAwaitTry {
 <T, TArgs extends any[]>(
 fn: (...args: TArgs) => T | PromiseLike<T>,
 ...args: TArgs
 ): Generator<TAwaited<Awaited<T>>, Awaited<T>, Awaited<T>>;
}

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
 <T>(value: Promise<T> | T): Generator<TAwaited<Awaited<T>>, Awaited<T>, Awaited<T>>;
 all: ICancGenAwaitAll;
 race: ICancGenAwaitRace;
 any: ICancGenAwaitAny;
 allSettled: ICancGenAwaitAllSettled;
 try: ICancGenAwaitTry;
}

function cancGenAwaitImpl<T>(
 value: Promise<T> | T,
): Generator<TAwaited<Awaited<T>>, Awaited<T>, Awaited<T>> {
 return (function* (): Generator<TAwaited<Awaited<T>>, Awaited<T>, Awaited<T>> {
 return yield awaited(value) as TAwaited<Awaited<T>>;
 })();
}

// Gen-world analog of coroutine.ts's `makeCombinator`: same one-step fold, but the built promise is
// wrapped in the `awaited(...)` marker instead of a bare `yield`, so the `cancGenAsync` driver treats
// it as an INTERNAL await (never emitted to the consumer's `for await`), matching every other
// `cancGenAwait` step.
function makeGenCombinator(build: (...args: any[]) => CancelablePromise<any>) {
 return function* (...args: any[]): Generator<TAwaited<any>, any, any> {
 return yield awaited(build.apply(CancelablePromise, args));
 };
}

export const cancGenAwait = cancGenAwaitImpl as ICancGenAwait;

cancGenAwait.all = makeGenCombinator(CancelablePromise.all) as ICancGenAwait['all'];
cancGenAwait.race = makeGenCombinator(CancelablePromise.race) as ICancGenAwait['race'];
cancGenAwait.any = makeGenCombinator(CancelablePromise.any) as ICancGenAwait['any'];
cancGenAwait.allSettled = makeGenCombinator(CancelablePromise.allSettled) as ICancGenAwait['allSettled'];
cancGenAwait.try = makeGenCombinator(CancelablePromise.try) as ICancGenAwait['try'];

/**
 * Body annotation for a `cancGenAsync` generator. `E` = emit type (what the consumer's `for await`
 * sees); `R` = final return. The `| TAwaited<any>` admits `yield* cancGenAwait(...)` internal awaits;
 * the `cancGenAsync` signature strips the marker from the consumer-facing emit type. Mirror of
 * `AsyncResult`. Optional: for a body that only `yield`s emits and `yield*`s `cancGenAwait`, `E` and
 * `R` infer from the body. Annotate for explicitness or to pin a bare `yield`'s type.
 */
export type AsyncGenResult<E, R = void> = Generator<E | TAwaited<any>, R, any>;

// Public typed signature: the emit type flows to the consumer and the internal-await marker is
// stripped. `Exclude<TYield, TAwaited<any>>` drops the marker (its unique `Symbol.for` key means real
// emit types never structurally match it), so the consumer's `for await` value is exactly the emit
// type. Mirror of `cancAsync` for the `async *` world (`cancGen.async`).
export function cancGenAsync<TYield, TReturn, TArgs extends any[], TThis = any>(
 genFn: (this: TThis, ...args: TArgs) => Generator<TYield, TReturn, any>,
 options?: TCancelableCoroutineGenOptions,
): (this: TThis, ...args: TArgs) => AsyncGenerator<Exclude<TYield, TAwaited<any>>, TReturn>;
export function cancGenAsync(genFn: IGeneratorLikeFn, options?: TCancelableCoroutineGenOptions): (...args: any[]) => AsyncGenerator<any, any>;
export function cancGenAsync(genFn: IGeneratorLikeFn, options: TCancelableCoroutineGenOptions = {}) {
 if (!isFunction(genFn)) {
 throw new TypeError('Argument is not a function');
 }

 const genFnName = genFn.displayName || genFn.name;

 if (genFnName) {
 coroutineGenWrapper.displayName = `coroutineGen ${genFnName}`;
 }

 const { transformYield, ...promiseOptions } = options;

 function coroutineGenWrapper(this: any, ...args: any[]) {
 const gen: TGeneratorLike = genFn.apply(this, args);

 // Linked-list queue of pending step requests. `currentStep` = the step being resolved right
 // now; `queuedStep` = the tail. A new `.next()/.throw()/.return()` call while a step is in
 // flight is appended and served in FIFO order once the current one settles — same ordering
 // guarantee a native async generator gives.
 let currentStep: TAsyncGeneratorStep | null = null;
 let queuedStep: TAsyncGeneratorStep | null = null;
 let done = false;
 // Distinct from `done` (which is also true on normal completion): set only by a cancel, so a
 // source that settles AFTER cancel can be dropped instead of driving the (torn-down) generator.
 let canceled = false;
 // The in-flight awaited source (internal await or the completed-return awaitable). Tracked so a
 // cancel arriving mid-await can abort the underlying op by canceling this source directly.
 let pendingSource: CancelablePromise<any> | undefined;

 const asyncGen = {
 [Symbol.asyncIterator]() {
 return this;
 },
 } as AsyncGenerator;

 for (const method of genMethods) {
 asyncGen[method] = (value?: any): CancelablePromise<any> => {
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

 const rawValue = transformYield ? transformYield(result.value) : result.value;
 const isAwaitedValue = isAwaited(rawValue);
 const settledValue = isAwaitedValue ? rawValue[awaitedSymbol] : rawValue;

 if (result.done) {
 // A completed generator's return value is never awaited-as-internal — it is the final
 // `{ value, done: true }` result. Resolve the awaitable then settle. Track it as the
 // outstanding source so a cancel mid-await aborts it.
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
 // Internal await: suspend on the value, feed the outcome back into the generator, do NOT
 // emit to the consumer. Track the source so a cancel mid-await aborts the underlying op.
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

 // Abort the in-flight awaited source directly. Its `.then` continuations are already gated on
 // `canceled`, so canceling here fires the underlying op's cancel handlers (the abort) without
 // driving the generator, which is about to be torn down below.
 const outstanding = pendingSource;
 pendingSource = undefined;
 if (outstanding && outstanding.cancelable) {
 outstanding.cancel(reason);
 }

 // Run the generator's cleanup (`finally` blocks) synchronously.
 try {
 gen.return(undefined);
 } catch {
 // Swallow cleanup errors — cancellation still proceeds.
 }

 const cancelError =
 reason instanceof CancelError ? reason : new CancelError(typeof reason === 'string' ? reason : 'Canceled');

 // Drain the queue: the canceled step resolves as done (its own promise is already being
 // canceled, so a rejection here would be redundant/unhandled), every OTHER pending step is
 // rejected with a CancelError. Walk the whole linked list from the head.
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
 * `for await` CONSUME inside a `cancGenAsync` producer body (`cancGen.forAwait`): pull each item of
 * `source` at an internal cancellation point (the pulls are marker-wrapped, so they stay internal and
 * are NEVER emitted to our consumer), running `cb` per item. `cb` has three forms (mirror of
 * `cancForAwait`): a sync fn, a bare generator fn (its `cancGenAwait` steps run inline on this
 * driver), or a `cancAsync` coroutine fn (returns a `CancelablePromise`, awaited via marker `yield`).
 * `return false` from any form breaks the loop. `.toArray` collects into an array instead.
 */
interface ICancGenForAwait {
 <T>(source: TEachSource<T>, cb: TForAwaitCallback<T>): Generator<TAwaited<any>, void, any>;
 toArray<T>(source: TEachSource<T>): Generator<TAwaited<any>, T[], any>;
}

export const cancGenForAwait = (function* cancGenForAwait(
 source: any,
 cb: (value: any, index: number) => any,
): Generator<TAwaited<any>, void, any> {
 const { it, async: isAsync } = getStepIterator(source);
 let index = 0;

 try {
 while (true) {
 // Marker-wrapped pull: internal await, not an emit. For an async source the `.next()` promise is
 // the cancellation point; for a sync source the yielded VALUE (which may be a promise) is.
 const result: IteratorResult<any> = yield awaited(it.next());

 if (result.done) {
 break;
 }

 const value = isAsync ? result.value : yield awaited(result.value);

 const outcome = cb(value, index++);
 let settled: void | false;

 if (isGenerator(outcome)) {
 // bare-generator cb: delegate, its cancGenAwait steps run on the driver
 settled = yield* (outcome as Generator<TAwaited<any>, void, any>);
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
 // Runs on normal completion, break, throw, AND on cancel-drain (the cancGenAsync driver reaches
 // here via gen.return()). Await source cleanup so its own `finally` settles. No RETURN_UNWIND: that
 // sentinel is a cancAsync-driver concern; the cancGenAsync driver drives cleanup directly.
 yield awaited(returnStepIterator(it));
 }
} as unknown) as ICancGenForAwait;

cancGenForAwait.toArray = (function* toArray(source: any): Generator<TAwaited<any>, any[], any> {
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
} as unknown) as ICancGenForAwait['toArray'];

/**
 * Re-emit a sub async-iterable from inside a `cancGenAsync` producer (`cancGen.delegate`): the
 * `yield* subAsyncGen` analog. Pulls each item of `source` INTERNALLY (marker-wrapped) and EMITs it to
 * OUR consumer via a bare `yield`. A separate helper because it is delegation, not a `for await` (no
 * per-item body). Direct `yield* source` cannot work: a sync producer generator cannot `yield*` an
 * async iterable.
 */
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
