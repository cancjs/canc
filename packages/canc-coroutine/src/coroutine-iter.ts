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

export type TCancelableCoroutineIterOptions = ICancelablePromiseOptions & {
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
// option, which promotes a plain yielded value to an internal await. Inside a `cancIterAsync` body,
// prefer `yield* cancIterAwait(value)` — it is typed (the resume value flows through `yield*`), while
// a bare `yield awaited(value)` is not.
export const awaited = <T = any>(value: T | TAwaited<T>): TAwaited<T> => ({
 [awaitedSymbol]: isAwaited(value) ? value[awaitedSymbol] : value,
});

/**
 * Internal await inside a `cancIterAsync` body: suspend on `value`, resume with its resolution, typed
 * via `yield*` (delegate `TReturn`), unlike the un-typeable bare `yield`. Wraps the value in the
 * `awaited` marker so the driver treats it as an internal await, NOT an emit. Mirror of `cancAwait`
 * for the `async *` world (`cancIter.await`).
 *
 * const n = yield* cancIterAwait(Promise.resolve(1)); // n: number, no cast
 */
export function cancIterAwait<T>(
 value: Promise<T> | T,
): Generator<TAwaited<Awaited<T>>, Awaited<T>, Awaited<T>> {
 return (function* (): Generator<TAwaited<Awaited<T>>, Awaited<T>, Awaited<T>> {
 return yield awaited(value) as TAwaited<Awaited<T>>;
 })();
}

/**
 * Body annotation for a `cancIterAsync` generator. `E` = emit type (what the consumer's `for await`
 * sees); `R` = final return. The `| TAwaited<any>` admits `yield* cancIterAwait(...)` internal awaits;
 * the `cancIterAsync` signature strips the marker from the consumer-facing emit type. Mirror of
 * `AsyncResult`. Optional: for a body that only `yield`s emits and `yield*`s `cancIterAwait`, `E` and
 * `R` infer from the body. Annotate for explicitness or to pin a bare `yield`'s type.
 */
export type AsyncIterResult<E, R = void> = Generator<E | TAwaited<any>, R, any>;

// Public typed signature: the emit type flows to the consumer and the internal-await marker is
// stripped. `Exclude<TYield, TAwaited<any>>` drops the marker (its unique `Symbol.for` key means real
// emit types never structurally match it), so the consumer's `for await` value is exactly the emit
// type. Mirror of `cancAsync` for the `async *` world (`cancIter.async`).
export function cancIterAsync<TYield, TReturn, TArgs extends any[], TThis = any>(
 genFn: (this: TThis, ...args: TArgs) => Generator<TYield, TReturn, any>,
 options?: TCancelableCoroutineIterOptions,
): (this: TThis, ...args: TArgs) => AsyncGenerator<Exclude<TYield, TAwaited<any>>, TReturn>;
export function cancIterAsync(genFn: IGeneratorLikeFn, options?: TCancelableCoroutineIterOptions): (...args: any[]) => AsyncGenerator<any, any>;
export function cancIterAsync(genFn: IGeneratorLikeFn, options: TCancelableCoroutineIterOptions = {}) {
 if (!isFunction(genFn)) {
 throw new TypeError('Argument is not a function');
 }

 const genFnName = genFn.displayName || genFn.name;

 if (genFnName) {
 coroutineIterWrapper.displayName = `coroutineIter ${genFnName}`;
 }

 const { transformYield, ...promiseOptions } = options;

 function coroutineIterWrapper(this: any, ...args: any[]) {
 const gen: TGeneratorLike = genFn.apply(this, args);

 // Linked-list queue of pending step requests. `currentStep` = the step being resolved right
 // now; `queuedStep` = the tail. A new `.next()/.throw()/.return()` call while a step is in
 // flight is appended and served in FIFO order once the current one settles — same ordering
 // guarantee a native async generator gives.
 let currentStep: TAsyncGeneratorStep | null = null;
 let queuedStep: TAsyncGeneratorStep | null = null;
 let done = false;

 const asyncGen = {
 [Symbol.asyncIterator]() {
 return this;
 },
 } as AsyncGenerator;

 for (const method of genMethods) {
 asyncGen[method] = (value?: any): CancelablePromise<any> => {
 return new CancelablePromise((resolve, reject, handleCancel) => {
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
 // `{ value, done: true }` result. Resolve the awaitable then settle.
 CancelablePromise.resolve(settledValue).then(
 (value) => settle('return', value),
 (error) => settle('throw', error),
 );
 return;
 }

 if (isAwaitedValue) {
 // Internal await: suspend on the value, feed the outcome back into the generator, do NOT
 // emit to the consumer.
 CancelablePromise.resolve(settledValue).then(
 (value) => resume('next', value),
 (error) => resume('throw', error),
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

 return coroutineIterWrapper;
}

/**
 * `for await` CONSUME inside a `cancIterAsync` producer body (`cancIter.forAwait`): pull each item of
 * `source` at an internal cancellation point (the pulls are marker-wrapped, so they stay internal and
 * are NEVER emitted to our consumer), running `cb` per item. `cb` has three forms (mirror of
 * `cancForAwait`): a sync fn, a bare generator fn (its `cancIterAwait` steps run inline on this
 * driver), or a `cancAsync` coroutine fn (returns a `CancelablePromise`, awaited via marker `yield`).
 * `return false` from any form breaks the loop. `.toArray` collects into an array instead.
 */
interface ICancIterForAwait {
 <T>(source: TEachSource<T>, cb: TForAwaitCallback<T>): Generator<TAwaited<any>, void, any>;
 toArray<T>(source: TEachSource<T>): Generator<TAwaited<any>, T[], any>;
}

export const cancIterForAwait = (function* cancIterForAwait(
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
 settled = yield* outcome; // bare-generator cb: delegate, its cancIterAwait steps run on the driver
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
 // Runs on normal completion, break, throw, AND on cancel-drain (the cancIterAsync driver reaches
 // here via gen.return()). Await source cleanup so its own `finally` settles. No RETURN_UNWIND: that
 // sentinel is a cancAsync-driver concern; the cancIterAsync driver drives cleanup directly.
 yield awaited(returnStepIterator(it));
 }
} as unknown) as ICancIterForAwait;

cancIterForAwait.toArray = (function* toArray(source: any): Generator<TAwaited<any>, any[], any> {
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
} as unknown) as ICancIterForAwait['toArray'];

/**
 * Re-emit a sub async-iterable from inside a `cancIterAsync` producer (`cancIter.delegate`): the
 * `yield* subAsyncGen` analog. Pulls each item of `source` INTERNALLY (marker-wrapped) and EMITs it to
 * OUR consumer via a bare `yield`. A separate helper because it is delegation, not a `for await` (no
 * per-item body). Direct `yield* source` cannot work: a sync producer generator cannot `yield*` an
 * async iterable.
 */
export function cancIterDelegate<T>(source: TEachSource<T>): Generator<T | TAwaited<any>, void, any> {
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
