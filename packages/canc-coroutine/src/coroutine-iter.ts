import { CancelablePromise, CancelError, ICancelablePromiseOptions } from '@cancjs/promise';
import { isFunction, isObject } from '../../_util';

import { IGeneratorLikeFn, TGeneratorLike } from './coroutine';

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

export const awaited = <T = any>(value: T | TAwaited<T>): TAwaited<T> => ({
 [awaitedSymbol]: isAwaited(value) ? value[awaitedSymbol] : value,
});

export function cancAsyncIter(genFn: IGeneratorLikeFn, options: TCancelableCoroutineIterOptions = {}) {
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
