import { CancelablePromise, ICancelablePromiseOptions, CancelError, isCancelError } from '@cancjs/promise';
import { isFunction, isObject, isThenable, isGenerator } from '../../_util';

export type TGeneratorLike<PYield = unknown, PReturn = any, PNext = unknown> = Omit<Generator<PYield, PReturn, PNext>, typeof Symbol.iterator>;

// Brand for BreakError, mirroring CancelError's Symbol.for approach: detection keys on the brand,
// not on `name`, so it survives realm boundaries and duplicated package copies.
const BREAK_ERROR_BRAND = Symbol.for('@cancjs/coroutine:BreakError');

// Thrown from an `each` callback (or by user code) to stop the loop cleanly, as an alternative to
// returning `false`. A break is normal loop termination, not an error: the coroutine resolves past
// the loop rather than rejecting.
export class BreakError extends Error {
 readonly [BREAK_ERROR_BRAND]!: true;

 constructor(message = '') {
 super(message);

 Object.setPrototypeOf(this, new.target.prototype);

 this.name = 'BreakError';
 this[BREAK_ERROR_BRAND] = true;
 }
}

export function isBreakError(value: unknown): value is BreakError {
 return isObject(value) && (value as any)[BREAK_ERROR_BRAND] === true;
}

// Sentinel yielded by `each`/`iter` as the very last statement of their `finally`, after source
// cleanup. When the coroutine is canceled mid-`yield*`, the cancel-drain unwinds via gen.return();
// resuming the delegate's finally-yield with gen.next() would let JS forget the return-completion
// and run the parent's post-`yield*` code (a `yield*` completing normally does not re-throw the
// return). The drain detects this sentinel and resumes with gen.return() instead, re-asserting the
// unwind so parent code after the loop stays dormant on cancel. On the normal (non-cancel) drive
// the sentinel is just a plain yielded value the driver resumes with next(), harmless: the delegate
// then returns and the parent continues as usual.
const RETURN_UNWIND = Symbol.for('@cancjs/coroutine:returnUnwind');

function isReturnUnwind(value: unknown): boolean {
 return value === RETURN_UNWIND;
}

// `PNext` is `any`: a coroutine body mixes bare `yield` (raw value in, no send type) with
// `yield*` (typed send value from `cancAwait`), so no single `PNext` fits every yield in the body.
export type AsyncResult<T = void> = Generator<unknown, T, any>;

interface IFn extends Function {
 displayName?: string;
}

export interface IGeneratorLikeFn<TThis extends any = any> extends IFn {
 (this: TThis, ...args: any[]): TGeneratorLike;
}

type TCoroutineReturn<TFn extends IGeneratorLikeFn, TReturn = ReturnType<TFn>> = Awaited<TReturn extends Generator<unknown, infer R, unknown> ? R : never>;

// Flag-only options passed to per-step yielded-value wrappers: the coroutine-level `signal`
// MUST NOT be re-applied to every yielded value, doing so re-subscribes the same AbortSignal on
// every step (listener amplification) and, once the signal is already aborted, makes the per-step
// wrapper constructor throw mid-coroutine. The signal belongs to the OUTER coroutine promise only;
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

 // Per-step wrappers carry only flag options; the signal lives on `coroutinePromise`.
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

 function coroutine(this: any, ...args: TArgs): CancelablePromise<TReturn> {
 const { promise: coroutinePromise, resolve, reject } = CancelablePromise.withResolvers<TReturn>(options);

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
 // Set while a gen.next()/throw()/return() call is on the stack. A cancel() triggered
 // synchronously from inside a running step (e.g. calling promise.cancel() from within an `each`
 // callback) must not call gen.return() re-entrantly: the generator is still executing and
 // gen.return() would throw "Generator is already executing". When set, drainFinally defers the
 // drain to a microtask so it runs after the current step unwinds.
 let executing = false;
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

 let result: IteratorResult<any>;
 executing = true;
 try {
 result = gen.next(value);
 } catch (err) {
 genDone = true;
 reject(err);
 return;
 } finally {
 executing = false;
 }
 // A cancel() re-entered from inside this step (e.g. cb called promise.cancel()) deferred its
 // drain past `executing`; run it now that the generator is off the stack, and drop this step's
 // (now inert) result.
 if (canceled) {
 drainFinally();
 return;
 }
 step(result);
 };

 const onRejected = (value: any) => {
 if (canceled || genDone) {
 return;
 }

 let result: IteratorResult<any>;
 executing = true;
 try {
 result = gen.throw(value);
 } catch (err) {
 genDone = true;
 reject(err);
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

 // Cancel-triggered finally drain. Calls gen.return(reason) to run the generator's finally
 // blocks. If a finally block itself yields, gen.return()/gen.next() report {done:false} and we
 // await the yielded value as a SHIELDED step (uncancelable cleanup), feeding the result back in
 // until the generator reports done. When the finally finishes, we settle the coroutine promise
 // as canceled (or with the finally's thrown error if cleanup fails). Re-entrancy-guarded.
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

 let result: IteratorResult<any>;
 executing = true;
 try {
 result = gen.return(canceledReason);
 } catch (err) {
 // A finally block threw synchronously: surface it as the coroutine rejection.
 genDone = true;
 reject(err);
 settleDrain();
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

 // A `each`/`iter` delegate ends its finally with the RETURN_UNWIND sentinel. Resuming it with
 // gen.next() would let the parent run its post-`yield*` code (JS drops the return-completion
 // once a `yield*` finishes normally). Resume with gen.return() to re-assert the unwind so the
 // parent stays dormant; the sentinel is the delegate's LAST finally statement, so nothing in
 // the delegate is skipped by the return-resume.
 if (isReturnUnwind(result.value)) {
 let next: IteratorResult<any>;
 try {
 next = gen.return(canceledReason);
 } catch (err) {
 genDone = true;
 reject(err);
 settleDrain();
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

// `each` accepts an async iterable or a sync iterable whose members may be promises: both are
// driven one pull at a time, awaiting each value at a coroutine cancellation point. The callback
// runs per item; returning `false` (or throwing `BreakError`) stops the loop cleanly.
export type TEachSource<T> = AsyncIterable<T> | Iterable<T | Promise<T>>;

// The `cancForAwait` callback runs per item; returning `false` (or throwing `BreakError`) stops the
// loop cleanly. Three forms are dispatched at runtime: a plain function (sync outcome), a generator
// function (so `yield`/`yield*` inside the body can await, driven with `yield*`), or one returning a
// CancelablePromise (awaited with a bare `yield`).
export type TForAwaitCallback<T> =
 | ((value: T, index: number) => void | false)
 | ((value: T, index: number) => Generator<unknown, void | false, any>)
 | ((value: T, index: number) => CancelablePromise<void | false>);

interface ICancForAwait {
 <T>(source: TEachSource<T>, cb: TForAwaitCallback<T>): Generator<unknown, void, any>;
 toArray<T>(source: TEachSource<T>): Generator<unknown, T[], any>;
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

// Resolves a source to a step iterator plus a flag for how each yielded step should be awaited.
// An async iterable's `.next()` returns a promise of `{ value, done }`, so the whole result is the
// cancellation point. A plain (sync) iterable returns `{ value, done }` synchronously but its values
// may be promises, so the VALUE is the cancellation point. Either way the driver awaits one thing
// per pull.
export function getStepIterator(source: any): { it: any; async: boolean } {
 if (source != null && isFunction(source[Symbol.asyncIterator])) {
 return { it: source[Symbol.asyncIterator](), async: true };
 }

 if (source != null && isFunction(source[Symbol.iterator])) {
 return { it: source[Symbol.iterator](), async: false };
 }

 throw new TypeError('Argument is not iterable');
}

// Runs the source iterator's `return()` (its `finally` cleanup). Called from the loop's `finally`,
// which the coroutine's cancel-drain reaches via `gen.return()`. The cancel reason cannot be
// forwarded here: when `gen.return(reason)` unwinds a `yield*`-delegated generator, the reason is not
// bound anywhere inside the delegate's `finally` (it only surfaces as the outer return value). What
// matters for cleanup is that `source.return()` runs at all, so the source generator's own `finally`
// executes. A source with no `return` (a bare iterator) or one that throws during cleanup must not
// mask the in-flight cancel, so cleanup errors are swallowed, whether they surface synchronously
// (a thrown `return()`) or asynchronously (a `return()` that returns a rejected promise). Returns a
// value the caller can `yield`/await; any rejection is neutralized here so it never orphans as an
// unhandled rejection or clobbers the cancel outcome.
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

 // An async `return()` may reject once its cleanup fails; swallow that too. Return a promise that
 // resolves regardless so the awaiting `yield` never sees the rejection.
 if (isObject(result) && isFunction((result as any).then)) {
 return (result as PromiseLike<any>).then(
 () => undefined,
 () => undefined,
 );
 }

 return result;
}

// Streaming for-await over a source: pull one item per step, run the callback, await its outcome,
// repeat. The callback outcome is dispatched three ways so an `await` inside the body works: a bare
// generator (from a generator-fn callback) is driven with `yield*`; a thenable/CancelablePromise is
// awaited with a bare `yield`; a plain value is used as-is. Returning `false` (or throwing
// `BreakError`) stops the loop cleanly. `cancForAwait.toArray` collects instead of running a callback.
export const cancForAwait = (function* cancForAwait(source: any, cb: (value: any, index: number) => any): Generator<unknown, void, any> {
 const { it, async } = getStepIterator(source);
 let index = 0;

 try {
 while (true) {
 // One cancellation point per pull: for an async source, await the `.next()` promise; for a sync
 // source, await the yielded VALUE (which may be a promise). The bare `yield` hands the awaited
 // thing to the coroutine driver.
 const result: IteratorResult<any> = async ? yield it.next() : it.next();

 if (result.done) {
 break;
 }

 const value = async ? result.value : yield result.value;

 // Three callback forms: a generator (drive it with `yield*` so `await`s in the body run at
 // coroutine cancellation points), a thenable (await with a bare `yield`), or a plain value. A
 // `false` result stops the loop cleanly, like a native `break`.
 const outcome = cb(value, index++);
 const settled = isGenerator(outcome) ? yield* outcome : isThenable(outcome) ? yield outcome : outcome;

 if (settled === false) {
 break;
 }
 }
 } catch (err) {
 // A BreakError is a clean stop (native `break`), not a failure: swallow it and let cleanup run.
 // Any other throw propagates out of this generator to reject the coroutine, still after cleanup.
 if (!isBreakError(err)) {
 throw err;
 }
 } finally {
 // Runs on normal completion, on break, on a thrown error, AND on coroutine cancel (the driver's
 // cancel-drain reaches here via gen.return()). Await source cleanup so its own `finally` settles.
 yield returnStepIterator(it);
 // On a cancel-drain the driver resumes this on the RETURN_UNWIND sentinel to re-assert the
 // return, keeping the parent's post-`yield*` code dormant. On any normal exit it is an inert
 // yielded value. Must be the LAST statement here (a return-resume skips anything after it).
 yield RETURN_UNWIND;
 }
}) as ICancForAwait;

cancForAwait.toArray = (function* toArray(source: any): Generator<unknown, any[], any> {
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
 // See `cancForAwait`: re-assert the cancel-drain's return-unwind so the parent's post-`yield*`
 // code stays dormant. Inert on any normal exit. Must be the LAST statement in this finally.
 yield RETURN_UNWIND;
 }

 return collected;
}) as ICancForAwait['toArray'];
