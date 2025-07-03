import { CancelablePromise, ICancelablePromiseOptions, CancelError } from '@cancjs/promise';
import { isFunction } from '../../_util';

export type TGeneratorLike<PYield = unknown, PReturn = any, PNext = unknown> = Omit<Generator<PYield, PReturn, PNext>, typeof Symbol.iterator>;

interface IFn extends Function {
 displayName?: string;
}

export interface IGeneratorLikeFn<TThis extends any = any> extends IFn {
 (this: TThis, ...args: any[]): TGeneratorLike;
}

type TCoroutineReturn<TFn extends IGeneratorLikeFn, TReturn = ReturnType<TFn>> = Awaited<TReturn extends Generator<unknown, infer R, unknown> ? R : never>;

// Flag-only options passed to per-step yielded-value wrappers: the coroutine-level `signal`/`ref`
// MUST NOT be re-applied to every yielded value, doing so re-subscribes the same AbortSignal on
// every step (listener amplification) and, once the signal is already aborted, makes the per-step
// wrapper constructor throw mid-coroutine. Signal/ref belong to the OUTER coroutine promise only;
// steps inherit just the behavioral flags.
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

export function cancAsync<TFn extends IGeneratorLikeFn<TThis>, TArgs extends any[] = Parameters<TFn>, TReturn extends any = TCoroutineReturn<TFn>, TThis extends any = any>(genFn: TFn, ctx?: TThis, options?: ICancelablePromiseOptions) {
 if (!isFunction(genFn)) {
 throw new TypeError('Argument is not a function');
 }

 const isCtx = ctx !== undefined;
 const genFnName = genFn.displayName || genFn.name;

 // Per-step wrappers carry only flag options; the signal/ref live on `coroutinePromise`.
 const stepOptions = extractFlagOptions(options);
 // Finally-drain steps run SHIELDED so cancellation can never abort in-flight cleanup: a shielded
 // wrapper's cancel() is a no-op and it is not chained to the (already canceled) coroutine
 // promise. Everything else inherits the coroutine's flag options.
 const shieldOptions: TFlagOptions = { ...stepOptions, shield: true };

 coroutine.displayName = 'coroutine';

 if (genFnName) {
 coroutine.displayName += ` ${genFnName}`;
 }

 function coroutine(this: any, ...args: TArgs) {
 const { promise: coroutinePromise, resolve, reject } = CancelablePromise.withResolvers(options);

 try {
 // `this` threading: an explicitly supplied `ctx` wins; otherwise the call-site `this` of the
 // returned coroutine function is forwarded to the generator function.
 const gen: Generator = genFn.apply(isCtx ? ctx : this, args);

 // Tracks whether the generator has reported `done`, guards against re-entering a finished
 // generator via gen.next()/gen.throw().
 let genDone = false;
 // Re-entrancy guard for the cancel-triggered finally drain: a single cancel() must not spawn
 // overlapping drains, and post-cancel ordinary steps must go inert.
 let draining = false;
 let canceledReason: any = undefined;
 // Track when cancel() was called so ordinary steps can check. The handleCancel hook runs
 // post-settlement, so we track it independently to mark the generator as canceled early.
 let canceled = false;

 // Override cancel() to prevent immediate settlement and let the finally drain own it. D23:
 // a finally that throws replaces the CancelError rejection.
 const originalCancel = coroutinePromise.cancel.bind(coroutinePromise);
 coroutinePromise.cancel = function(reason?: any) {
 if (!canceled) {
 canceled = true;
 canceledReason = reason;
 drainFinally();
 }
 // Don't call originalCancel; the drain owns settlement. Re-cancel is a no-op.
 };

 const step = (result: any) => {
 if (result.done) {
 genDone = true;

 // Post-cancel ordinary completion is inert: the finally drain owns settlement; do not
 // resolve (and do not settle as canceled — the drain will).
 if (!canceled) {
 resolve(result.value);
 }
 } else {
 // Once canceled, ordinary (non-finally) yielded values are inert: they are neither driven
 // nor chained back to the coroutine promise. Cleanup in `finally` is driven by drainFinally().
 if (canceled) {
 return;
 }

 const promise = CancelablePromise.resolve(result.value, stepOptions).then(onFulfilled, onRejected);
 // Sanctioned internal cross-package hook: `_chain` is `protected` on CancelablePromise
 // (TS-only privacy), this bracket-string access is the documented, smallest-surface way
 // for canc-coroutine to link the yielded-value promise into the parent chain (propagates
 // cancel + bubble bookkeeping) without widening the public d.ts surface. Do not
 // rename/inline; do not access via `as any` cast (bracket form is the established
 // convention, grep `_chain` before changing its signature).
 promise['_chain'](coroutinePromise);
 }
 };

 const onFulfilled = (value: any) => {
 // Coroutine canceled while this step was in flight: drop it (drainFinally owns the rest).
 if (canceled || genDone) {
 return;
 }

 try {
 step(gen.next(value));
 } catch (err) {
 genDone = true;
 reject(err);
 }
 };

 const onRejected = (value: any) => {
 if (canceled || genDone) {
 return;
 }

 try {
 step(gen.throw(value));
 } catch (err) {
 genDone = true;
 reject(err);
 }
 };

 // Cancel-triggered finally drain. Calls gen.return(reason) to run the generator's finally
 // blocks. If a finally block itself yields, gen.return()/gen.next() report {done:false} and we
 // await the yielded value as a SHIELDED step (uncancelable cleanup), feeding the result back in
 // until the generator reports done. When the finally finishes, we settle the coroutine promise
 // as canceled (or with the finally's thrown error if cleanup fails). Re-entrancy-guarded.
 const drainFinally = () => {
 if (draining || genDone) {
 return;
 }
 draining = true;

 let result: IteratorResult<any>;
 try {
 result = gen.return(canceledReason);
 } catch (err) {
 // A finally block threw synchronously: surface it as the coroutine rejection.
 genDone = true;
 reject(err);
 return;
 }

 pumpFinally(result);
 };

 // Drives one finally-yield step: if not done, await the yielded value as a shielded (never
 // canceled, never chained) promise and resume the generator with its result / thrown reason.
 // When the generator reports done, settles the coroutine promise as canceled.
 const pumpFinally = (result: IteratorResult<any>) => {
 if (result.done) {
 // Finally drain complete: settle the coroutine as canceled.
 genDone = true;
 const error = new CancelError(undefined);
 reject(error);
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
 reject(err);
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
 reject(err);
 return;
 }
 pumpFinally(next);
 }
 );
 };

 step(gen.next());
 } catch (err) {
 // Sync-throw generators: genFn.apply(...) or the first gen.next() throwing synchronously
 // rejects the coroutine.
 reject(err);
 }

 return coroutinePromise;
 }

 return coroutine;
}

// https://github.com/microsoft/TypeScript/issues/36855#issuecomment-588286256
function createYielder<TProduce, TSend>(_call: (y: TProduce) => TSend): (arg: TProduce) => Generator<TProduce, TSend, TSend> {
 return function* (arg: TProduce): Generator<TProduce, TSend, TSend> {
 return yield arg;
 }
}

type cancAwait = <T>(value: Promise<T> | T) => T;
export const cancAwait = createYielder(null as unknown as cancAwait);
