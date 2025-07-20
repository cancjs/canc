import { CancelablePromise, ICancelablePromiseOptions, CancelError, isCancelError } from '@cancjs/promise';
import { isFunction, isObject } from '../../_util';

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

function isEmptyFlags(flags: TFlagOptions): boolean {
 for (const _key in flags) {
 return false;
 }

 return true;
}

export function cancAsync<TFn extends IGeneratorLikeFn<TThis>, TArgs extends any[] = Parameters<TFn>, TReturn extends any = TCoroutineReturn<TFn>, TThis extends any = any>(genFn: TFn, ctx?: TThis, options?: ICancelablePromiseOptions) {
 if (!isFunction(genFn)) {
 throw new TypeError('Argument is not a function');
 }

 const isCtx = ctx !== undefined;
 const genFnName = genFn.displayName || genFn.name;

 // Per-step wrappers carry only flag options; the signal/ref live on `coroutinePromise`.
 // Computed once here, not per yielded step (options never change across a coroutine's life).
 const stepOptions = extractFlagOptions(options);
 // When no flag options are set, a yielded value that is already a same-constructor
 // CancelablePromise needs no wrapping: `CancelablePromise.resolve(value, {})` returns it
 // unchanged, so the step can subscribe with `.then()` directly and skip the resolve() round-trip
 // (its instanceof/constructor check plus the seven-key option comparison) on every step. With
 // flags present the wrapper still reconfigures the value, so the fast path is gated on this being
 // empty.
 const stepOptionsEmpty = isEmptyFlags(stepOptions);
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
 // Set when the cancel came through the disposal path (Symbol.dispose / Symbol.asyncDispose):
 // the drain's terminal CancelError is marked `disposed` for parity with core _dispose.
 let disposing = false;

 // Deferred that settles when the finally drain completes. Deposited on the first cancel that
 // starts a drain; the drain's terminal branches (pumpFinally done / any sync-or-async throw)
 // resolve it. cancel() returns it so `await coroutinePromise.cancel(reason)` resolves only
 // AFTER cleanup has run (awaitable-cancel contract). In sync (asyncCancel:false) mode there
 // is nothing to await and cancel() returns undefined, matching core.
 let drainDeferred: { promise: CancelablePromise<any>; resolve: (v?: any) => void } | undefined;
 const settleDrain = () => {
 if (drainDeferred) {
 drainDeferred.resolve();
 }
 };

 // Override cancel() to prevent immediate settlement and let the finally drain own it. D23:
 // a finally that throws replaces the CancelError rejection. But if the generator is already
 // done (completed naturally or errored), the coroutine is already settled, so cancel is a no-op
 // (either way, isCancelable will be false).
 //
 // Guards (shield / strict / already-settled) are delegated to the prototype semantics before
 // draining: a shielded coroutine promise never drains (cancel is a no-op); a strict one throws
 // on a settled/canceled promise unless this is the internal disposal path (`_disposing`).
 coroutinePromise.cancel = function(reason?: any, _disposing?: boolean): any {
 const self = coroutinePromise;

 // Re-cancel while a drain is already in progress: return the SAME awaitable so every caller
 // (including dispose) awaits the one cleanup run. Guarded before the shield/settled checks so
 // a second cancel does not re-trip a strict throw.
 if (canceled && !genDone) {
 return self.asyncCancel ? drainDeferred!.promise : undefined;
 }

 // Shield: never drain — a shielded promise's cancel is a no-op (strict → throw unless
 // disposing), matching core cancel(). Returns undefined like core's shielded no-op.
 if (self.shield && self.cancelable) {
 if (self.strict && !_disposing) {
 throw new Error('Shielded promise cannot be canceled');
 }
 return undefined;
 }

 // Already settled/canceled (or generator finished): silent no-op like core, strict throws
 // unless disposing. Returns undefined (core cancel() on a settled promise returns undefined).
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
 }

 drainFinally();

 return self.asyncCancel ? drainDeferred!.promise : undefined;
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

 // Fast path: a yielded value that is already a same-constructor CancelablePromise, with no
 // per-step flag options to apply, needs no resolve() wrap — subscribe with `.then()`
 // directly. Otherwise fall back to resolve() to wrap raw values / foreign thenables and to
 // reconfigure flags when the coroutine carries them.
 const value = result.value;
 const source =
 stepOptionsEmpty && value instanceof CancelablePromise && value.constructor === CancelablePromise
 ? value
 : CancelablePromise.resolve(value, stepOptions);
 const promise = source.then(onFulfilled, onRejected);
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
 settleDrain();
 return;
 }

 pumpFinally(result);
 };

 // Drives one finally-yield step: if not done, await the yielded value as a shielded (never
 // canceled, never chained) promise and resume the generator with its result / thrown reason.
 // When the generator reports done, settles the coroutine promise as canceled.
 const pumpFinally = (result: IteratorResult<any>) => {
 if (result.done) {
 // Finally drain complete: settle the coroutine as canceled, preserving the ORIGINAL
 // cancel reason normalized exactly like core cancel() (CancelError passthrough /
 // object → cause / string|undefined → message).
 genDone = true;
 const error = isCancelError(canceledReason)
 ? canceledReason
 : isObject(canceledReason)
 ? new CancelError(undefined, { cause: canceledReason })
 : new CancelError(canceledReason);
 if (disposing) {
 error.disposed = true;
 }
 reject(error);
 settleDrain();
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
 settleDrain();
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
 settleDrain();
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
 * // ^ number ^ string — tuple, not `unknown[]`
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

interface ICancAwaitAll {
 <T extends readonly unknown[] | []>(
 values: readonly [...T],
 options?: ICancelablePromiseOptions,
 ): Generator<CancelablePromise<TAwaitedTuple<T>>, TAwaitedTuple<T>, TAwaitedTuple<T>>;
}

interface ICancAwaitRace {
 <T extends readonly unknown[] | []>(
 values: readonly [...T],
 options?: ICancelablePromiseOptions,
 ): Generator<CancelablePromise<Awaited<T[number]>>, Awaited<T[number]>, Awaited<T[number]>>;
}

interface ICancAwaitAny {
 <T extends readonly unknown[] | []>(
 values: readonly [...T],
 options?: ICancelablePromiseOptions,
 ): Generator<CancelablePromise<Awaited<T[number]>>, Awaited<T[number]>, Awaited<T[number]>>;
}

interface ICancAwaitAllSettled {
 <T extends readonly unknown[] | []>(
 values: readonly [...T],
 options?: ICancelablePromiseOptions,
 ): Generator<CancelablePromise<TSettledTuple<T>>, TSettledTuple<T>, TSettledTuple<T>>;
}

interface ICancAwait {
 <T>(value: Promise<T> | T): Generator<Promise<T> | T, T, T>;
 all: ICancAwaitAll;
 race: ICancAwaitRace;
 any: ICancAwaitAny;
 allSettled: ICancAwaitAllSettled;
}

function makeCombinator(build: (...args: any[]) => CancelablePromise<any>) {
 return function* (...args: any[]): Generator<any, any, any> {
 return yield build.apply(CancelablePromise, args);
 };
}

export const cancAwait = createYielder(null as unknown as cancAwait) as ICancAwait;

cancAwait.all = makeCombinator(CancelablePromise.all) as ICancAwait['all'];
cancAwait.race = makeCombinator(CancelablePromise.race) as ICancAwait['race'];
cancAwait.any = makeCombinator(CancelablePromise.any) as ICancAwait['any'];
cancAwait.allSettled = makeCombinator(CancelablePromise.allSettled) as ICancAwait['allSettled'];
