import { createAggregateError, isFunction, isObject, isThenable } from '../../_util';
import { CancelError } from './cancel-error';
import { isCancelError, isCancPromise } from './helpers';

// Agent-wide brand: same rationale as CANCEL_ERROR_BRAND in cancel-error.ts. A Symbol.for
// registry entry is identical across realms and across duplicated package copies, so duck-typing
// via this brand (isCancPromise) is collision-proof and works across dual-package-hazard copies,
// unlike `instanceof CancelablePromise`.
export const CANCEL_PROMISE_BRAND = Symbol.for('@cancjs/promise:CancelablePromise');

export type TPromiseExecutor<T> = (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void;
export type TCancelablePromiseExecutor<T> = (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any) => void, handleCancel: (onCancel: TOnCancel) => void) => void;
export type TCancelReason = string | object | CancelError;
export type TCancelFn = (reason?: TCancelReason) => void;
export type TOnCancel = TCancelFn;

export interface IHandleCancelOptions {
	/**
	 * Fire the handler even if the promise is ALREADY canceled at registration time. The handler is
	 * called asynchronously (microtask) with the original cancel reason instead of being a silent
	 * no-op. Under `strict` this also suppresses the throw for this call. Default: false.
	 */
	immediate?: boolean;
}
export type TCancelablePromiseStates = 'PENDING' | 'FORCE_PENDING' | 'FULFILLED' | 'REJECTED' | 'CANCELED';

export interface ICancelablePromiseFlagOptions {
	/** cancel() asynchronously settles failed cancelation handlers instead of throwing */
	asyncCancel?: boolean;
	/** Keeps the current promise cancelable when native promise is provided through resolve() */
	forceCancelable?: boolean;
	/** Cancelation propagates to parent promise */
	bubble?: boolean;
	/** Throw on cancelation problems */
	strict?: boolean;
	/**
	 * Protects this promise's own pending work from cancelation initiated from below or outside:
	 * a direct `cancel()` is a silent no-op (or throws under `strict`), and a bubble-cancel arriving
	 * from canceled children is stopped here.
	 *
	 * This is an UPWARD/self shield only. Unlike Kotlin's `NonCancellable` or `asyncio.shield`,
	 * which protect a running job from cancellation of the whole scope, `shield` does NOT stop
	 * downward propagation: if this promise's own upstream is canceled or rejected, this promise
	 * still adopts that rejection (native Promise semantics — down-propagation cannot be intercepted
	 * without breaking try/catch). It is per-node and is not inherited by `then`-derived children.
	 */
	shield?: boolean;
}

export interface ICancelablePromiseOptions extends ICancelablePromiseFlagOptions {
	signal?: IAbortSignal | IAbortSignal[];
}

/**
 * Common shape for options accepted by standalone cancelation helpers (forceCancelable/
 * makeCancelable and friends): lets a caller swap in a different CancelablePromise-compatible
 * constructor instead of always using the built-in class.
 */
export interface ICancelableHelperOptions extends ICancelablePromiseOptions {
	CancelablePromise?: typeof CancelablePromise;
}

interface IAbortSignal {
	readonly aborted: boolean;
	readonly reason?: any;
	addEventListener(type: 'abort', listener: any, options?: unknown): void;
	removeEventListener(type: 'abort', listener: any, options?: unknown): void;
}

export interface ICancelable<T = any> extends PromiseLike<T> {
	cancel(reason?: any): any;
}

export interface ICancelablePromiseWithResolvers<T> {
	promise: CancelablePromise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: any) => void;
	cancel: (reason?: any) => void | CancelablePromise<PromiseSettledResult<unknown>[]>
}

function noop() {/**/}

const states = {
	PENDING: 'PENDING',
	FORCE_PENDING: 'FORCE_PENDING',
	FULFILLED: 'FULFILLED',
	REJECTED: 'REJECTED',
	CANCELED: 'CANCELED',
} as { [key in TCancelablePromiseStates]: key };

// Packed flag bits for the per-instance `_flags` int. Replacing five boolean own-properties with
// one small integer is the bulk of the per-instance memory reduction; the public boolean read/write
// API (`p.bubble` etc) is preserved by prototype getter/setters that read/write these bits.
const FLAG_ASYNC_CANCEL = 1;
const FLAG_FORCE_CANCELABLE = 2;
const FLAG_BUBBLE = 4;
const FLAG_STRICT = 8;
const FLAG_SHIELD = 16;

// Shared stand-in options for internal/species construction (`_then` -> native then -> ctor). The
// resolve/reject wrappers only read `forceCancelable`; the derived promise's real flags are set by
// the calling `then()` immediately after construction, so nothing else here is observed. Reused (not
// reallocated) on every derived-promise construction on the hot chain path.
// Frozen so an accidental future mutation (e.g. assigning a signal on it) cannot poison every
// derived promise that shares this single stand-in object.
const INTERNAL_CALL_OPTIONS = Object.freeze({ forceCancelable: true }) as ReturnType<typeof CancelablePromise['_getOptions']>;

// Extends PromiseConstructor, as defined in
// lib.es2015.promise, lib.es2015.iterable, lib.es2015.symbol.wellknown, lib.es2018.promise, lib.es2020.promise, lib.es2021.promise.d.ts, lib.esnext.promise.d.ts
class CancelablePromise<T> implements ICancelable<T>, Promise<T> {
	// `declare`d on purpose: under the current es5 target + useDefineForClassFields:false this
	// field already emits nothing, so species resolves via the inherited native Promise getter
	// (returns `this`, i.e. CancelablePromise, satisfying SpeciesConstructor). `declare` makes
	// that "no emit" EXPLICIT rather than incidental. If the TS target is ever bumped to es2022+
	// (defineForClassFields:true by default there), a bare (non-declare) static field would emit
	// an own `undefined` property that shadows the inherited getter, breaking SpeciesConstructor
	// resolution (it would fall back to native %Promise%, silently downgrading every
	// then()-derived promise to a plain native Promise, see species-regression.spec.ts).
	static declare readonly [Symbol.species]: PromiseConstructor;

	protected static _pendingInternalCall= false;

	static defaultOptions: Required<ICancelablePromiseFlagOptions> = {
		asyncCancel: true,
		forceCancelable: true,
		bubble: true,
		strict: false,
		shield: false
	};

	/**
	 * Creates a Promise that is resolved with an array of results when all of the provided Promises
	 * resolve, or rejected when any Promise is rejected.
	 * @param values An array of Promises.
	 * @param [options]
	 * @returns A new Promise.
	 */
	static all<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>, T9 | PromiseLike<T9>, T10 | PromiseLike<T10>], options?: ICancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
	static all<T1, T2, T3, T4, T5, T6, T7, T8, T9>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>, T9 | PromiseLike<T9>], options?: ICancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
	static all<T1, T2, T3, T4, T5, T6, T7, T8>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>], options?: ICancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7, T8]>;
	static all<T1, T2, T3, T4, T5, T6, T7>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>], options?: ICancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7]>;
	static all<T1, T2, T3, T4, T5, T6>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>], options?: ICancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6]>;
	static all<T1, T2, T3, T4, T5>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>, T5 | PromiseLike<T5>], options?: ICancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5]>;
	static all<T1, T2, T3, T4>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>], options?: ICancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4]>;
	static all<T1, T2, T3>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>], options?: ICancelablePromiseOptions): CancelablePromise<[T1, T2, T3]>;
	static all<T1, T2>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>], options?: ICancelablePromiseOptions): CancelablePromise<[T1, T2]>;
	static all<T>(values: readonly (T | PromiseLike<T>)[], options?: ICancelablePromiseOptions): CancelablePromise<T[]>;
	static all<TAll>(values: Iterable<TAll | PromiseLike<TAll>>, options?: ICancelablePromiseOptions): CancelablePromise<TAll[]>;

	static all<TAll>(values: Iterable<TAll | PromiseLike<TAll>>, options?: ICancelablePromiseOptions): CancelablePromise<TAll[]> {
		// Deferred-construction pattern to work around referring to the promise from inside its own
		// executor (todo: "new (noop) -> withResolvers") — withResolvers() is the same
		// `new this(noop, options)` internally, just named/shaped for this exact use.
		const { promise: resultsPromise, resolve: resolveResults, reject: rejectResults } = this.withResolvers<TAll[]>(options);

		try {
			const results: TAll[] = [];
			const inputs: CancelablePromise<any>[] = []; // Track all inputs for loser-cancellation
			let count = 0;
			let hasRejected = false; // Guard to cancel losers only on first rejection
			// Options are identical for every item, so normalize once instead of per iteration.
			const normalizedOptions = this._getOptions(options);

			for (const promiseOrValue of values) {
				const index = count++;
				const promise = this._adopt(promiseOrValue, normalizedOptions);
				inputs.push(promise);

				// `_subscribe` + `_chainInput` (not a species `.then()`): the per-item reaction is a
				// pure sink and the input's chain-count is raised explicitly instead of as a side
				// effect of constructing a derived child. Keeping the input at the same total count
				// preserves the oracle that canceling the RESULT promise does not bubble down and
				// cancel still-pending inputs.
				promise._subscribe(
					(value) => {
						results[index] = value;

						if (!--count) {
							resolveResults(results);
						}
					},
					(error) => {
						if (!hasRejected) {
							hasRejected = true;
							// Cancel-losers: on first rejection, cancel all other pending inputs
							// that have bubble:true (doc: remaining pending inputs are canceled).
							this._cancelLosers(inputs, promise);
						}
						rejectResults(error);
					}
				);

				promise._chainInput(resultsPromise);
			}

			if (!count) {
				resolveResults(results);
			}
		} catch (error) {
			rejectResults(error);
		}

		return resultsPromise;
	}

	/**
	 * Creates a Promise that is resolved with an array of results when all
	 * of the provided Promises resolve or reject.
	 * @param values An array of Promises.
	 * @param [options]
	 * @returns A new Promise.
	 */
	static allSettled<T extends readonly unknown[] | readonly [unknown]>(values: T, options?: ICancelablePromiseOptions): CancelablePromise<{ -readonly [P in keyof T]: PromiseSettledResult<T[P] extends PromiseLike<infer U> ? U : T[P]> }>;
	static allSettled<T>(values: Iterable<T>, options?: ICancelablePromiseOptions): CancelablePromise<PromiseSettledResult<T extends PromiseLike<infer U> ? U : T>[]>;

	static allSettled<T>(values: Iterable<T>, options?: ICancelablePromiseOptions): CancelablePromise<PromiseSettledResult<any>[] | { [P in keyof any]: PromiseSettledResult<any> }> {
		// Options are identical for every item, so normalize once instead of per iteration.
		// The spread stays outside any try so an iterable that throws while iterating surfaces
		// synchronously (documented behavior), not as a rejected aggregate.
		const normalizedOptions = this._getOptions(options);

		return this.all(
			[...values].map(promiseOrValue =>
				// `_adopt` reuses a same-constructor canc input as-is and only wraps raw values /
				// foreign thenables, dropping the former unconditional resolve() wrap that ran a full
				// construction per item on top of the one all() performs on the mapped result.
				this._adopt(promiseOrValue, normalizedOptions).then(
					(value) => ({ status: 'fulfilled', value }),
					(reason) => ({ status: 'rejected', reason })
				) as CancelablePromise<PromiseSettledResult<any>>
			),
			options
		);
	}

	/**
	 * The any function returns a promise that is fulfilled by the first given promise to be fulfilled, or rejected with an AggregateError containing an array of rejection reasons if all of the given promises are rejected. It resolves all elements of the passed iterable to promises as it runs this algorithm.
	 * @param values An array or iterable of Promises.
	 * @param [options]
	 * @returns A new Promise.
	 */
	static any<T extends readonly unknown[] | []>(values: T, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T[number]>>;
	static any<T>(values: Iterable<T | PromiseLike<T>>, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>>;

	static any<T>(values: Iterable<T | PromiseLike<T>>, options?: ICancelablePromiseOptions): CancelablePromise<Awaited<T>> {
		// Deferred-construction pattern (todo: "new (noop) -> withResolvers") — see all() above.
		const { promise: resultPromise, resolve: resolveResult, reject: rejectResult } = this.withResolvers<Awaited<T>>(options);

		// Indexed by input position (spec order), not settlement order
		const errors: any[] = [];
		const inputs: CancelablePromise<any>[] = []; // Track all inputs for loser-cancellation
		let count = 0;
		let rejectedCount = 0;
		let hasFulfilled = false; // Guard to cancel losers only on first fulfill

		// Options are identical for every item, so normalize once instead of per iteration.
		const normalizedOptions = this._getOptions(options);

		try {
			for (const promiseOrValue of values) {
				const index = count++;
				const promise = this._adopt(promiseOrValue, normalizedOptions);
				inputs.push(promise);

				// `_subscribe` + `_chainInput` (not a species `.then().catch()`): a single per-item
				// reaction sink plus explicit chain-count accounting. The input reaches the same
				// total count the derived children raised, so canceling the RESULT promise does not
				// bubble down and cancel still-pending inputs.
				promise._subscribe(
					value => {
						if (!hasFulfilled) {
							hasFulfilled = true;
							// Cancel-losers: on first fulfill, cancel all other pending inputs
							// that have bubble:true (doc: losers are canceled).
							this._cancelLosers(inputs, promise);
						}
						// value is T (unresolved-thenable element type), not yet Awaited<T> — same
						// looseness the previous `resultPromise._resolve(value)` (typed `any`) had.
						resolveResult(value as Awaited<T>);
					},
					error => {
						errors[index] = error;
						rejectedCount++;

						if (rejectedCount === count) {
							rejectResult(createAggregateError(errors, 'All promises were rejected'));
						}
					}
				);

				promise._chainInput(resultPromise);
			}

			if (!count) {
				rejectResult(createAggregateError(errors, 'All promises were rejected'));
			}
		} catch (error) {
			rejectResult(error);
		}

		return resultPromise;
	}

	/**
	 * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
	 * or rejected.
	 * @param values An array of Promises.
	 * @param [options]
	 * @returns A new Promise.
	 */
	static race<T>(values: readonly T[], options?: ICancelablePromiseOptions): CancelablePromise<T extends PromiseLike<infer U> ? U : T>;
	static race<T>(values: Iterable<T>, options?: ICancelablePromiseOptions): CancelablePromise<T extends PromiseLike<infer U> ? U : T>;
	static race<T>(values: Iterable<T | PromiseLike<T>>, options?: ICancelablePromiseOptions): CancelablePromise<T>;

	static race<T>(values: Iterable<T | PromiseLike<T>>, options?: ICancelablePromiseOptions): CancelablePromise<T> {
		// Deferred-construction pattern (todo: "new (noop) -> withResolvers") — see all() above.
		const { promise: resultPromise, resolve: resolveResult, reject: rejectResult } = this.withResolvers<T>(options);

		// Options are identical for every item, so normalize once instead of per iteration.
		const normalizedOptions = this._getOptions(options);

		try {
			for (const promiseOrValue of values) {
				// `_subscribe` (pure reaction sink, no species child) plus a single bubbleOnComplete
				// `_chain` of the result directly onto the input. Race keeps one chain ref per input,
				// so canceling or settling the result bubbles straight back to the pending inputs (see
				// the race bubble tests), the cascade race wants (unlike all()/any()).
				const promise = this._adopt<T>(promiseOrValue, normalizedOptions);
				promise._subscribe(resolveResult, rejectResult);

				promise._chain(resultPromise, true);
			}
		} catch (error) {
			rejectResult(error);
		}

		return resultPromise;
	}

	/**
	 * Creates a new rejected promise for the provided reason.
	 * @param reason The reason the promise was rejected.
	 * @param [options]
	 * @returns A new rejected Promise.
	 */
	static reject<T = never>(reason?: any, options?: ICancelablePromiseOptions): CancelablePromise<T> {
		return new this(
			(_resolve, reject) => {
				reject(reason);
			},
			options
		);
	}

	/**
	 * Creates a new resolved promise for the provided value.
	 * @param value A promise.
	 * @param [options]
	 * @returns A promise whose internal state matches the provided promise.
	 */
	static resolve<T>(value: T | PromiseLike<T>, options?: ICancelablePromiseOptions): CancelablePromise<T>;
	static resolve(): CancelablePromise<void>;

	static resolve<T>(value?: T | PromiseLike<T>, options?: ICancelablePromiseOptions): CancelablePromise<T> {
		if (value instanceof this && value.constructor === this && !this._checkOptionsChanged(value, options)) {
			// Return unmodified promise similarly to Promise.resolve
			return value;
		} else {
			// Wrap other promise instances or reconfigure same instances
			return new this(
				(resolve) => {
					resolve(value);
				},
				options
			);
		}
	}

	/**
	 * Creates a new Promise and returns it in an object, along with its resolve and reject functions.
	 * @param [options]
	 * @returns An object with the properties `promise`, `resolve`, and `reject`.
	 */
	static withResolvers<T>(options?: ICancelablePromiseOptions): ICancelablePromiseWithResolvers<T> {
		const promise = new this<T>(noop, options);

		return {
			promise,
			resolve: promise._resolve,
			reject: promise._reject,
			cancel: promise._getBoundCancel(),
		}
	}

	/**
	 * Invokes `fn` with `args`, wrapping both a synchronous throw and the returned value/promise
	 * into a single settled CancelablePromise. Lets callers use `.catch`/cancelation uniformly
	 * around code that may throw synchronously instead of always rejecting asynchronously.
	 * @param fn Function to invoke, may throw synchronously or return a value/thenable.
	 * @param args Arguments passed through to `fn`.
	 */
	static try<T, TArgs extends any[]>(fn: (...args: TArgs) => T | PromiseLike<T>, ...args: TArgs): CancelablePromise<T> {
		return new this<T>((resolve, reject) => {
			try {
				resolve(fn(...args));
			} catch (error) {
				reject(error);
			}
		});
	}

	protected static _getOptions(options?: ICancelablePromiseOptions) {
		const mergedOptions: ICancelablePromiseOptions & Required<ICancelablePromiseFlagOptions> = { ...this.defaultOptions };

		if (options) {
			if ('bubble' in options) {
				mergedOptions.bubble = !!options.bubble;
			}

			if ('strict' in options) {
				mergedOptions.strict = !!options.strict;
			}

			if ('asyncCancel' in options) {
				mergedOptions.asyncCancel = !!options.asyncCancel;
			}

			if ('forceCancelable' in options) {
				mergedOptions.forceCancelable = !!options.forceCancelable;
			}

			if ('shield' in options) {
				mergedOptions.shield = !!options.shield;
			}

			if ('signal' in options) {
				mergedOptions.signal = options.signal || undefined;
			}
		}

		return mergedOptions;
	}

	/**
	 * Combinator input adoption. Behaviorally identical to `resolve(value, normalizedOptions)` but
	 * with the fast path inlined: an already-same-constructor CancelablePromise whose options are
	 * unchanged is returned as-is (fast instanceof + constructor check), skipping the extra static
	 * dispatch. Any other input (raw value, native thenable, reconfigured canc promise) falls back to
	 * a direct construction. `normalizedOptions` must already be normalized (hoisted once per
	 * combinator call, not per item).
	 */
	protected static _adopt<T>(value: T | PromiseLike<T>, normalizedOptions: ICancelablePromiseOptions): CancelablePromise<T> {
		if (value instanceof this && value.constructor === this && !this._checkOptionsChanged(value as any, normalizedOptions)) {
			// Same-constructor canc promise with unchanged options: reuse as-is (matches resolve()).
			return value as unknown as CancelablePromise<T>;
		}
		// Wrap raw values / native thenables / reconfigured canc promises. Constructing directly
		// (instead of routing back through resolve) avoids repeating the instanceof + options check
		// that just failed above.
		return new this<T>(
			(resolve) => {
				resolve(value);
			},
			normalizedOptions
		);
	}

	protected static _checkOptionsChanged(instance: ICancelablePromiseOptions, options?: ICancelablePromiseOptions): boolean {
		if (!options) {
			return false;
		}

		const keys: Array<keyof ICancelablePromiseOptions> = ['asyncCancel', 'forceCancelable', 'bubble', 'strict', 'shield', 'signal'];

		for (const key of keys) {
			if (options[key] !== undefined && instance[key] !== options[key]) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Cancel-losers doctrine: cancel all pending inputs except the winner/rejector.
	 * Respects bubble:false inputs, they are never canceled (by the loser-cancellation mechanism).
	 * @param inputs All input promises in the combinator
	 * @param winner The promise that settled first (fulfill in any(), reject in all())
	 */
	protected static _cancelLosers(inputs: CancelablePromise<any>[], winner: CancelablePromise<any>): void {
		for (const input of inputs) {
			// Shielded inputs are skipped: their cancel() is a no-op anyway, but skipping keeps
			// the doctrine explicit, a shielded loser is never canceled by a combinator.
			if (input !== winner && input.cancelable && input.bubble && !input.shield) {

				input.cancel(new CancelError('Canceled as loser in combinator'));
			}
		}
	}

	// `declare`: type-only, same "no emit" rationale as the static species field above.
	// Never actually assigned; the inherited Promise.prototype[Symbol.toStringTag] getter
	// ("Promise") is what callers observe. Keeping it declare-only avoids a future
	// defineForClassFields:true target creating an own `undefined` property that would shadow
	// that inherited getter.
	declare readonly [Symbol.toStringTag]: string;

	// `declare`: assigned once on the prototype at module load (below, alongside the
	// setPrototypeOf wiring), not per-instance — every instance inherits the same brand value.
	declare readonly [CANCEL_PROMISE_BRAND]: true;

	// Per-instance own-property layout (kept deliberately small — see the memory notes below):
	// _flags packed booleans (asyncCancel/forceCancelable/bubble/strict/shield),
	// read/written through the prototype getters/setters below
	// _internalState state-machine string
	// _resolve/_reject the wrapped settlement functions
	// _cancelHandlers lazily allocated only when handleCancel() actually registers one
	// _abortSignals/_abortListeners lazily allocated only when a signal is wired
	// _chainsCount/_completedChainsCount bubble bookkeeping (only touched when chained)
	// _pendingSyncCancel(+Reason) transient sync-executor cancel handoff
	// _canceledReason/_isCanceledReasonSet retained for late immediate handlers
	// cancel bound copy, installed lazily on first read (see the accessor below)
	// The five public flag booleans (asyncCancel/forceCancelable/bubble/strict/shield) are NOT
	// per-instance fields anymore; they live in `_flags` and are exposed via prototype
	// getter/setters, so reading/writing `p.bubble` keeps working unchanged.

	// Cold fields default-valued on the PROTOTYPE (assigned once at module load, see below), NOT
	// per-instance. `declare` = zero per-instance emit; a read falls through to the shared prototype
	// default and a write lazily creates an own property only for the promises that actually diverge
	// (chained, canceled, sync-cancel handoff). A plain resolved/rejected promise therefore carries
	// none of these as own slots. Layout summary and rationale in the memory note above.
	declare protected _chainsCount: number;
	declare protected _completedChainsCount: number;
	declare protected _pendingSyncCancel: boolean;
	declare protected _pendingSyncCancelReason: any;
	declare protected _canceledReason: any;
	declare protected _isCanceledReasonSet: boolean;

	// Always own properties (per-instance): the settlement wrappers, the state machine, the packed
	// flags. These differ per promise, so a prototype default would not help.
	protected _resolve!: (value?: any) => void;
	protected _reject!: (reason?: any) => void;
	// Initialized eagerly (not declare-only): the executor's resolve/reject wrappers read
	// `_internalState` on `tempThis` while it still runs synchronously, before the constructor's
	// copy block migrates it to the real instance, so the PENDING default must exist up front.
	protected _internalState: TCancelablePromiseStates = 'PENDING';
	protected _flags!: number;

	// Lazily allocated on first handleCancel() registration — most promises never register a
	// cancel handler, so the array is not created up front.
	protected _cancelHandlers?: TOnCancel[];
	// Listener management for abort signals: maps each signal to its registered listener
	// function so we can remove it on settle. Lazily allocated only when a signal is wired
	// (the common case has no signal, so both stay undefined).
	protected _abortSignals?: IAbortSignal[];
	protected _abortListeners?: Map<IAbortSignal, any>;
	// Bound `cancel`, created lazily only when a detached reference is requested (withResolvers).
	protected _boundCancel?: TCancelFn;

	/**
	 * Creates a new Promise.
	 * @param executor A callback used to initialize the promise.
	 * @param [options]
	 */
	constructor(executor: TCancelablePromiseExecutor<T>, options?: ICancelablePromiseOptions) {
		if (!(this instanceof CancelablePromise)) {
			throw new TypeError(`CancelablePromise constructor cannot be invoked without 'new'`);
		}

		const This = new.target;
		// `this` when executor calls are synchronous, otherwise NativePromise instance
		let instance: CancelablePromise<T> = this;
		// Stable reference to the temporary constructor `this` used to detect synchronous
		// executor settlement (before Reflect.construct returns the real promise instance).
		const tempThis = this;
		// Set when a non-strict pre-aborted signal is detected. The executor is NOT run in that
		// case (the promise is born canceled); the rejection is deferred to the real instance after
		// Reflect.construct so it settles the returned promise, not the throwaway temp `this`. This
		// mirrors the _pendingSyncCancel handoff and keeps settler-release working normally (the
		// executor never settles synchronously, so the returned promise's live resolve/reject
		// wrappers survive for withResolvers to hand out).
		let pendingPreAbortReason: any = undefined;
		// Sentinel so a signal whose reason is genuinely undefined still triggers the deferred path.
		let hasPendingPreAbort = false;

		// Internal/species construction fast path: `_then` sets `_pendingInternalCall` while native
		// then() constructs the derived promise via species. Those calls carry no options, no signal,
		// and the caller (`then`) overwrites `_flags` right after, so the whole options-
		// normalization + signal-precheck + post-construct wiring is dead work here. Skip it: the
		// derived promise is always forceCancelable (default) so its resolve wrapper adopts the
		// settled value, and the executor is the minimal native-then reaction.
		const isInternalCall = This._pendingInternalCall;

		// Only normalize options on the public path. On the internal path `normalizedOptions` is a
		// tiny stand-in read by the resolve/reject wrappers (they only consult `forceCancelable`,
		// which defaults to true) — no allocation of the full merged-options object.
		const normalizedOptions = isInternalCall
			? INTERNAL_CALL_OPTIONS
			: This._getOptions(options);

		// Pre-check for aborted signals BEFORE construction. `strict` throws here (executor must
		// never run for a strict pre-aborted signal); non-strict marks the deferred handoff so the
		// executor is skipped and the born-canceled rejection is applied to the real instance after
		// Reflect.construct.
		if (!isInternalCall && normalizedOptions.signal) {
			const signals = Array.isArray(normalizedOptions.signal) ? normalizedOptions.signal : [normalizedOptions.signal];
			const preAbortedSignal = signals.find(s => s.aborted);
			if (preAbortedSignal) {
				if (normalizedOptions.strict) {
					throw new Error('Aborted signal cannot be reused');
				}
				pendingPreAbortReason = preAbortedSignal.reason;
				hasPendingPreAbort = true;
			}
		}

		// Compatible with ES5 transpilation target: we deliberately do NOT write
		// `class CancelablePromise extends Promise` + `super(executor)`. An ES5-target
		// transpile of `class X extends Y` calls Y as a plain function via `Y.call(this, ...)`
		// (or a `_super.apply` helper) — but native Promise's internal slots can only be initialized
		// by `new Promise(...)`/`Reflect.construct`, so a transpiled `super()` into a native Promise
		// throws ("Failed to construct 'Promise': Please use the 'new' operator") on ES5-targeting
		// engines/transpilers (this is the same reason every other "extend a native built-in"
		// ES5-transpile guide reaches for Reflect.construct). `Reflect.construct(NativePromise, args,
		// new.target)` builds a genuine native Promise instance whose prototype is `new.target.prototype`
		// (so `instanceof CancelablePromise` / subclasses still hold, and Promise's species/then
		// machinery treats it as a first-class Promise) while surviving ES5 downleveling, because
		// `Reflect.construct` is a plain runtime call, not `class`/`super` syntax that needs special
		// transpiler support.
		//
		// The returned native instance becomes the REAL `instance` we hand back from the
		// constructor; the original `this` (`tempThis`) is only used transiently while the executor
		// runs synchronously (see reject()'s `instance === tempThis` branch above/below) and is then
		// discarded — `Object.assign(instance, this)` below copies over anything the synchronous
		// executor stashed on `this` (e.g. `_resolve`/`_reject`) onto the real instance.

		instance = Reflect.construct(
			NativePromise,
			[
				((resolve_, reject_) => {
					function resolve(value?: T | PromiseLike<T>): void {
						// Prevent cancelation in case of early state changes
						if (instance._internalState === states.PENDING) {
							if (isThenable(value)) {
								if (value === (instance as unknown)) {
									// Self-resolution (e.g. `p.then(() => p)`). Native Promise resolution
									// rejects a promise resolved with itself ("Chaining cycle detected"),
									// but the forceCancelable branch below adopts via `value.then(...)`
									// instead of `resolve_(value)`, so it would never reach native cycle
									// detection and would hang. Reject with the same TypeError here and do
									// not enter the adoption-cancel branch, so self-cycles keep native
									// semantics without linking the promise to itself.
									reject(new TypeError('Chaining cycle detected for promise'));
									return;
								}

								// Adopting another cancelable: link it into this promise's chain graph as
								// a counted parent, the same wiring a declared parent gets. Cancel then
								// reaches the adopted promise only when every counted consumer is gone and
								// the value is unconsumed, and its own `bubble: false` / `shield: true`
								// are honored inside `_chain`/`cancel`. This runs once per settle (not per
								// `.then()` call), and plain values / native promises / foreign thenables
								// never enter it.
								const adopted = isCancPromise(value) ? value : undefined;
								if (adopted) {
									adopted._chain(instance);
								}

								// On the internal (then-derived) path the shared stand-in options always
								// say forceCancelable:true, so read the live flag instead: then() copies the
								// parent's packed flags onto the child right after construction, and this
								// wrapper only runs on a later microtask, so the inherited bit is already set.
								// The public path keeps consulting the normalized options (correct there).
								const forceCancelable = isInternalCall
									? (instance._flags & FLAG_FORCE_CANCELABLE) !== 0
									: normalizedOptions.forceCancelable;
								if (forceCancelable) {
									const onAdopt = (value_: any): void => {
										if (instance._internalState === states.PENDING) {
											instance._internalState = states.FULFILLED;
											instance._runSettlementEffects();
										}

										resolve_(value_);
									};

									// Subscribe to the adopted value's settlement. For a cancelable value use
									// the non-counting internal subscription: `_chain` above already raised its
									// consumer count for THIS promise, so awaiting settlement through the counting
									// `.then()` as well would add a phantom consumer that never completes and would
									// keep the adopted promise alive forever.
									if (adopted) {
										adopted._subscribe(onAdopt, reject);
									} else {
										value.then(onAdopt, reject);
									}
								} else {
									instance._internalState = states.FORCE_PENDING;
									instance._runSettlementEffects();
									resolve_(value);
								}
							} else {
								instance._internalState = states.FULFILLED;
								instance._runSettlementEffects();
								resolve_(value);
							}
						} else {
							resolve_(value);
						}
					}

					function reject(reason?: any): void {
						// Cancellation parity: an external rejection carrying a CancelError
						// transitions the promise to CANCELED exactly like cancel(), and must fire
						// registered cancel handlers + suppress its own unhandled rejection.
						//
						// cancel() sets state CANCELED itself BEFORE calling _reject, so this
						// PENDING->CANCELED branch is skipped on the cancel() path -> handlers fire
						// exactly once (no double-fire). It only triggers for genuinely external
						// CancelError rejections (executor reject / handler throw / adopted thenable).
						let externalCancel = false;
						let wasSettled = false;

						if (instance._internalState === states.PENDING) {
							if (isCancelError(reason)) {
								instance._internalState = states.CANCELED;
								externalCancel = true;
							} else {
								instance._internalState = states.REJECTED;
							}
							wasSettled = true;
						}

						reject_(reason);

						// Run settlement effects (e.g., abort listener cleanup) only once on
						// PENDING→settled transition.
						if (wasSettled) {
							instance._runSettlementEffects();
						}

						if (externalCancel) {
							if (instance === tempThis) {
								// Synchronous executor: `instance` is still the temporary `this`
								// (not yet a real promise) — .catch() would throw. Defer the
								// cancellation side effects to the post-construct step.
								instance._pendingSyncCancel = true;
								instance._pendingSyncCancelReason = reason;
							} else {
								instance._runCancellation(reason);
							}
						}
					}

					function handleCancel(onCancel: TOnCancel): CancelablePromise<T> {
						// cancelHandlers are shared between `this` and NativePromise instance
						return instance.handleCancel(onCancel);
					}

					this._resolve = resolve;
					this._reject = reject;

					// Non-strict pre-aborted signal: the promise is born canceled, so the executor
					// does not run. The deferred rejection is applied to the real instance after
					// Reflect.construct (see the post-construct handoff below), which keeps the live
					// settlement wrappers intact for withResolvers and lets settler-release happen
					// naturally at that later settle.
					if (!hasPendingPreAbort) {
						executor(resolve, reject, handleCancel);
					}
				}) as TPromiseExecutor<T>
			],
			This
		) as CancelablePromise<T>;

		// Initialize the real instance's own-property layout explicitly. The field initializers at
		// the top of the class run against `tempThis` inside the constructor body, but the object
		// returned by `Reflect.construct` (running native Promise's constructor) is a DIFFERENT
		// object that never ran them — the previous `Object.assign(instance, this)` migrated the
		// whole eager field set over. Enumerating the exact layout here (instead of a blanket
		// Object.assign of every field plus leftovers) keeps the instance lean: the lazily-allocated
		// `_cancelHandlers`/`_abortSignals`/`_abortListeners`/`_boundCancel` are intentionally NOT
		// created here — they stay absent until first use. Only the settlement wrappers, the state
		// the synchronous executor may have advanced, a synchronously-registered cancel handler, and
		// the deferred sync-cancel handoff are carried over from `tempThis`. The executor never
		// settles synchronously on the pre-abort path (it does not run), so the wrappers migrated
		// here are always live and settler-release stays intact.
		instance._resolve = tempThis._resolve;
		instance._reject = tempThis._reject;
		instance._internalState = tempThis._internalState;
		// The cold fields (`_chainsCount`, cancel-reason retention, etc.) intentionally stay on the
		// prototype default here — only a synchronously-registered cancel handler and the deferred
		// sync-cancel handoff can have diverged on `tempThis` during the executor, so carry just
		// those, and only when actually present, to avoid materializing own properties needlessly.
		if (tempThis._cancelHandlers) {
			instance._cancelHandlers = tempThis._cancelHandlers;
		}
		if (tempThis._pendingSyncCancel) {
			instance._pendingSyncCancel = true;
			instance._pendingSyncCancelReason = tempThis._pendingSyncCancelReason;
		}

		// Internal/species construction: the calling `then()` overwrites `_flags` immediately and
		// there is never a signal, so skip the flag unpacking and the signal wiring
		// entirely. Seed `_flags` with the default (forceCancelable) so any flag read before `then`
		// assigns is still well-defined.
		if (isInternalCall) {
			instance._flags = FLAG_FORCE_CANCELABLE;
			return instance;
		}

		// Packed flag options (one int instead of five boolean own-properties).
		let flags = 0;
		if (normalizedOptions.asyncCancel) flags |= FLAG_ASYNC_CANCEL;
		if (normalizedOptions.forceCancelable) flags |= FLAG_FORCE_CANCELABLE;
		if (normalizedOptions.bubble) flags |= FLAG_BUBBLE;
		if (normalizedOptions.strict) flags |= FLAG_STRICT;
		if (normalizedOptions.shield) flags |= FLAG_SHIELD;
		instance._flags = flags;

		const { signal } = normalizedOptions;

		// Pre-aborted signals are already handled by the deferred handoff below (strict threw
		// before construction), so no listeners are wired for them — the promise is born canceled.
		if (signal && !hasPendingPreAbort) {
			// Support both single signal and array of signals.
			const signals = Array.isArray(signal) ? signal : [signal];

			// Non-aborted: register abort listeners for all signals (first-abort-wins).
			// Listener cleanup happens via _runSettlementEffects on settle. The tracking
			// array/map are allocated here (lazily) — only signal-wired promises pay for them.
			const abortSignals: IAbortSignal[] = instance._abortSignals = [];
			const abortListeners = instance._abortListeners = new Map<IAbortSignal, any>();
			for (const sig of signals) {
				const onAbort = () => {
					instance.cancel(sig.reason);
				};

				abortSignals.push(sig);
				abortListeners.set(sig, onAbort);
				sig.addEventListener('abort', onAbort, { once: true });
			}
		}

		// Deferred pre-aborted-signal handoff. The executor was skipped, so the promise is born
		// pending. Mark it CANCELED synchronously (so `canceled`/`cancelable` observe the final
		// state in the same tick as construction, matching the previous behavior) and retain the
		// reason for late immediate handlers, but defer the native-promise rejection + unhandled-
		// suppression to a microtask. Deferring lets the constructor return with the live `_resolve`/
		// `_reject` wrappers still attached, so `withResolvers` hands out usable settlers before
		// settlement nulls them; the extra microtask only delays the `.catch`/`await` rejection, which
		// the pre-abort specs already tolerate (they assert the reason after a macrotask flush).
		if (hasPendingPreAbort) {
			const preAbortError = new CancelError(undefined, { cause: pendingPreAbortReason });
			instance._internalState = states.CANCELED;
			instance._canceledReason = preAbortError;
			instance._isCanceledReasonSet = true;
			const settle = instance._reject;
			NativePromise.resolve().then(() => {
				// `_reject` sees state already CANCELED, so its own PENDING->settled transition is
				// skipped; drive the native rejection + settlement effects + cancellation cascade
				// explicitly, mirroring the cancel() path.
				settle(preAbortError);
				instance._runSettlementEffects();
				instance._runCancellation(preAbortError);
			});
		}

		// Run cancellation side effects deferred from a synchronous external CancelError
		// rejection (temp-`this` gotcha): now that `instance` is the real promise, suppress the
		// rejection and fire cancel handlers. Skipped for internal derived-promise construction
		// (species via then) — those never carry a deferred external cancel.
		if (instance._pendingSyncCancel && !This._pendingInternalCall) {
			instance._pendingSyncCancel = false;
			const reason = instance._pendingSyncCancelReason;
			instance._pendingSyncCancelReason = undefined;
			instance._runCancellation(reason);
		}

		return instance;
	}

	// Flag accessors backed by the packed `_flags` int (see the memory notes on the field block).
	// Getters/setters keep the public boolean read/write API identical to the former own-property
	// fields while storing all five flags in a single integer.
	get asyncCancel(): boolean { return (this._flags & FLAG_ASYNC_CANCEL) !== 0; }
	set asyncCancel(v: boolean) { this._setFlag(FLAG_ASYNC_CANCEL, v); }
	get forceCancelable(): boolean { return (this._flags & FLAG_FORCE_CANCELABLE) !== 0; }
	set forceCancelable(v: boolean) { this._setFlag(FLAG_FORCE_CANCELABLE, v); }
	get bubble(): boolean { return (this._flags & FLAG_BUBBLE) !== 0; }
	set bubble(v: boolean) { this._setFlag(FLAG_BUBBLE, v); }
	get strict(): boolean { return (this._flags & FLAG_STRICT) !== 0; }
	set strict(v: boolean) { this._setFlag(FLAG_STRICT, v); }
	get shield(): boolean { return (this._flags & FLAG_SHIELD) !== 0; }
	set shield(v: boolean) { this._setFlag(FLAG_SHIELD, v); }

	private _setFlag(bit: number, value: boolean): void {
		if (value) {
			this._flags |= bit;
		} else {
			this._flags &= ~bit;
		}
	}

	get canceled(): boolean {
		return this._internalState === states.CANCELED;
	}

	/** @deprecated use `canceled` */
	get isCanceled(): boolean {
		return this.canceled;
	}

	get cancelable(): boolean {
		// Settled-ness is derived purely from the internal state machine now. A promise is
		// cancelable only while genuinely PENDING; FORCE_PENDING (forceCancelable:false adoption),
		// FULFILLED, REJECTED and CANCELED are all non-cancelable.
		return this._internalState === states.PENDING;
	}

	/** @deprecated use `cancelable` */
	get isCancelable(): boolean {
		return this.cancelable;
	}

	/**
	 * Snapshot of this promise's active cancelation options (flags + signal not included,
	 * those are one-shot constructor inputs, not ongoing state).
	 */
	get options(): Required<ICancelablePromiseFlagOptions> {
		return {
			asyncCancel: this.asyncCancel,
			forceCancelable: this.forceCancelable,
			bubble: this.bubble,
			strict: this.strict,
			shield: this.shield,
		};
	}

	/**
	 * Attaches callbacks for the resolution and/or rejection of the Promise.
	 *
	 * If a callback returns a CancelablePromise, that returned promise is adopted and linked into
	 * the chain graph as a counted parent, the same as a declared parent: canceling the promise
	 * returned by this call reaches the adopted promise once every counted consumer is gone and its
	 * value is unconsumed, honoring the adopted promise's own `bubble`/`shield` options. A callback
	 * that returns a plain native promise is not linked this way; that stays a cancellation gap.
	 * @param onFulfilled The callback to execute when the Promise is resolved.
	 * @param onRejected The callback to execute when the Promise is rejected.
	 * @returns A Promise for the completion of which ever callback is executed.
	 */
	then<TResult1 = T, TResult2 = never>(onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null, onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): CancelablePromise<TResult1 | TResult2> {
		// `_then` runs native then() through the species machinery, so its result is already a
		// CancelablePromise of the right (possibly subclass) constructor. The derived child inherits
		// this promise's flags except `shield` (per-node, never inherited). Rather than round-trip
		// through `_getOptions` + `resolve` (which rebuilt an options object and then reconstructed
		// the promise whenever the parent's flags differed from the fresh default), copy the packed
		// flags straight across as a single integer and clear the shield bit. Behaviorally identical
		// to the old resolve-reconstruct path, minus the per-call allocation and comparison.
		const promise = this._then(onFulfilled, onRejected);
		promise._flags = this._flags & ~FLAG_SHIELD;

		this._chain(promise);

		return promise;
	}

	/**
	 * Attaches a callback for only the rejection of the Promise.
	 * @param onRejected The callback to execute when the Promise is rejected.
	 * @returns A Promise for the completion of the callback.
	 */
	catch<TResult = never>(onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null): CancelablePromise<T | TResult> {
		return this.then(null, onRejected);
	}

	/**
	 * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
	 * resolved value cannot be modified from the callback.
	 *
	 * If `onFinally` returns a CancelablePromise, it is adopted the same way a `then` callback's
	 * returned cancelable is: linked in as a counted parent, so canceling the promise returned by
	 * this call reaches it once every counted consumer is gone. A plain native promise returned
	 * from `onFinally` is not linked this way.
	 * @param onFinally The callback to execute when the Promise is settled (fulfilled or rejected).
	 * @returns A Promise for the completion of the callback.
	 */
	finally(onFinally?: (() => void) | null): CancelablePromise<T> {
		if (typeof onFinally === 'function') {
			const This = this.constructor as typeof CancelablePromise;

			return this.then(
				(value: any) => This.resolve(onFinally()).then(() => value),
				(reason: any) => This.resolve(onFinally()).then(() => {
					throw reason;
				})
			);
		} else {
			return this.then(null, null);
		}
	}

	handleCancel(onCancel: TOnCancel, options?: IHandleCancelOptions): CancelablePromise<T> {
		if (this.cancelable) {
			if (isFunction(onCancel)) {
				// Allocate the handlers array on first registration — most promises never register
				// a cancel handler, so the array stays absent for the common case.
				const handlers = this._cancelHandlers || (this._cancelHandlers = []);
				if (!handlers.includes(onCancel)) {
					handlers.push(onCancel);
				}
			}
		} else if (options && options.immediate && this.canceled) {
			// Immediate opt-in: the promise is already canceled, fire the handler
			// asynchronously (microtask) with the original cancel reason instead of a silent no-op.
			// This also suppresses the strict throw for this call.
			if (isFunction(onCancel)) {
				const reason = this._isCanceledReasonSet ? this._canceledReason : undefined;

				NativePromise.resolve().then(() => {
					onCancel(reason);
				});
			}
		} else if (this.strict) {
			throw new Error(`${this.canceled ? 'Canceled' : 'Settled'} promise cannot add cancel handler`);
		}

		return this;
	}

	/**
	 * Cancels a pending promise, rejecting it with a {@link CancelError}.
	 *
	 * The reason is normalized: a {@link CancelError} passes through unchanged; any other
	 * object becomes the `cause` of a fresh {@link CancelError}; a string/undefined becomes its
	 * message. Registered cancel handlers still receive the original `reason`.
	 *
	 * Return contract: in `asyncCancel` mode (default) returns a promise that settles once all
	 * cancel handlers have settled, an empty `allSettled` result when there are none, so the
	 * result is always awaitable. In `asyncCancel:false` (sync) mode handlers run synchronously and
	 * `cancel()` returns `undefined`.
	 *
	 * Handler timing: registered cancel handlers START synchronously the moment the cancel takes
	 * effect, regardless of what triggered it (an explicit `cancel()`, an upstream rejection, or a
	 * bubble from settled children). What a handler returns is still awaited asynchronously by the
	 * `asyncCancel` settlement promise; only the handler's invocation is synchronous.
	 *
	 * On an already-settled/canceled promise this is a silent no-op unless `strict`, which throws.
	 * @param reason The cancellation reason.
	 */
	cancel(reason?: any, _disposing?: boolean): void | CancelablePromise<PromiseSettledResult<unknown>[]> {
		// `_disposing` is the internal disposal path (Symbol.dispose / Symbol.asyncDispose via
		// _dispose): it suppresses the strict throws (disposal is always a no-throw no-op on a
		// shielded or already-settled promise, never an error) WITHOUT mutating public state, and it
		// marks the fresh CancelError as disposed. Routing dispose through cancel() means an
		// overridden cancel (e.g. the coroutine finally-drain) governs disposal too.

		// Shield: a shielded promise protects its own pending work from cancelation initiated
		// from below/outside — a direct cancel() is a silent no-op (strict → throw), and a
		// bubble-cancel from children (which arrives via this same cancel() call in _chain) is
		// stopped here. Down-propagation is untouched: an upstream cancel/reject reaches this
		// promise through the _reject wrapper, not through cancel(), so shielded nodes still settle.
		if (this.shield && this.cancelable) {
			if (this.strict && !_disposing) {
				throw new Error('Shielded promise cannot be canceled');
			}

			return;
		}

		if (this.cancelable) {
			// Set CANCELED BEFORE _reject so the reject wrapper's external-cancel branch is
			// skipped (no double firing of handlers on the cancel() path).
			this._internalState = states.CANCELED;

			// Normalize the cancellation reason into a CancelError:
			// - an existing CancelError (brand-checked) passes through unwrapped;
			// - any other object is preserved as `cause` of a fresh CancelError (arbitrary-object
			// reason support — the raw object is never used as the rejection reason directly);
			// - a string/undefined becomes the CancelError message.
			const error = isCancelError(reason)
				? reason
				: isObject(reason)
					? new CancelError(undefined, { cause: reason })
					: new CancelError(reason);

			if (_disposing) {
				error.disposed = true;
			}

			this._reject(error);

			// Settlement effects (listener cleanup) are already called in the reject wrapper
			// after state transition (reject() is synchronous), but call again to ensure
			// cleanup on cancel path. The map-based tracking prevents double-cleanup.
			this._runSettlementEffects();

			return this._runCancellation(reason, true);
		} else if (this.strict && !_disposing) {
			throw new Error(`${this.canceled ? 'Canceled' : 'Settled'} promise cannot be canceled`);
		}
	}

	/**
	 * Returns a `cancel` bound to this instance for the detached call site (`withResolvers().cancel`)
	 * that hands the function out on its own. The bound copy is created on demand
	 * and cached as an own property so every promise no longer pays for a per-instance bound `cancel`;
	 * the normal `p.cancel(...)` method call stays prototype-dispatched and allocates nothing.
	 */
	protected _getBoundCancel(): TCancelFn {
		let bound = this._boundCancel;
		if (!bound) {
			bound = this._boundCancel = this.cancel.bind(this);
		}
		return bound;
	}

	/**
	 * Explicit-resource-management disposal, shared by [Symbol.dispose] and [Symbol.asyncDispose].
	 * An internal NO-THROW cancel: it bypasses `strict` (dispose-after-settle and shielded disposal
	 * are both normal, expected no-ops, never errors) and cancels a genuinely pending, non-shielded
	 * promise with a dispose-marked CancelError.
	 *
	 * @returns The handler-settlement promise in asyncCancel mode (so `[Symbol.asyncDispose]` and
	 * `await using` can await cleanup); otherwise undefined.
	 */
	protected _dispose(): void | CancelablePromise<PromiseSettledResult<unknown>[]> {
		// Route through the instance's (possibly overridden) cancel so subclasses like the coroutine
		// finally-drain govern disposal too. `_disposing` suppresses the strict throw and marks the
		// CancelError as disposed; shielded / already-settled promises no-op inside cancel().
		return this.cancel('Disposed', true);
	}

	/**
	 * Cancellation side effects shared by cancel() and the external-CancelError reject path:
	 * suppresses the promise's own unhandled rejection and fires registered cancel handlers.
	 * State (CANCELED) must already be set by the caller.
	 *
	 * `needsReturn` is true only for the explicit `cancel()`/`_dispose()` callers whose return value
	 * is consumed (always-return contract). The bubble/external-CancelError reject paths discard
	 * the return, so they pass false and skip constructing the settlement promise entirely — the
	 * decisive win for cancel storms, where every node in the chain is canceled but only the caller's
	 * return is ever awaited.
	 */
	protected _runCancellation(reason?: any, needsReturn?: boolean): void | CancelablePromise<PromiseSettledResult<unknown>[]> {
		// Retain the original reason for late immediate handlers.
		this._canceledReason = reason;
		this._isCanceledReasonSet = true;

		// Suppress unhandled rejection (targeted — only for canceled promises). Go through `_then`
		// (not the public `catch`) so the derived suppression child takes the internal-construction
		// fast path (no options normalization, no signal wiring) and none of `then()`'s chain
		// bookkeeping (`_chain`, flag copy) runs. Registering this no-op rejection reaction is what
		// marks the rejection handled for the host; the child itself is discarded.
		this._then(undefined, noop);

		const handlers = this._cancelHandlers;

		if (this.asyncCancel) {
			// No handlers (the common case): nothing to run. Only the consumed-return callers pay
			// for the empty-allSettled stand-in; the discard-return paths (bubble, external cancel)
			// build nothing.
			if (!handlers || handlers.length === 0) {
				return needsReturn ? (this.constructor as typeof CancelablePromise).resolve([]) : undefined;
			}

			// Discard-return paths (bubble/external-cancel cascade — every node in a canceled chain):
			// the caller ignores the return, so skip the allSettled + per-handler combinator machinery
			// entirely. Handlers run synchronously here, the same way the consumed-return path below
			// starts each handler synchronously inside its settlement-promise executor, so a handler's
			// start time does not depend on which path canceled the promise. Their own rejections are
			// swallowed (thenable results absorbed with a noop reaction), matching the allSettled
			// path's no-unhandled-rejection behavior without constructing an all()/withResolvers per
			// canceled node. This is the dominant cost in a cancel storm, where the bubble bookkeeping
			// registers an onComplete handler on every intermediate node.
			if (!needsReturn) {
				const pending = handlers.slice();
				handlers.length = 0;
				for (const handler of pending) {
					try {
						const r = handler(reason);
						if (isThenable(r)) {
							(r as PromiseLike<unknown>).then(noop, noop);
						}
					} catch (_e) {
						// asyncCancel swallows handler failures; nothing consumes them here.
					}
				}
				return undefined;
			}

			const This = this.constructor as typeof CancelablePromise;
			const handlerPromises = handlers.map(handler => new This(resolve => resolve(handler(reason))));
			handlers.length = 0;

			// Consumed-return path (explicit cancel()/dispose): allSettled drives the handlers and
			// gives the caller an awaitable that settles once all handlers settle.
			return This.allSettled(handlerPromises);
		} else {
			// Sync mode returns undefined (documented split): handlers fire synchronously and any
			// throw would surface immediately, so there is nothing to await.
			if (handlers?.length) {
				try {
					for (const handler of handlers) {
						handler(reason);
					}
				} finally {
					handlers.length = 0;
				}
			}
		}
	}

	/**
	 * Settlement side effects run whenever the promise settles (any way: FULFILLED, REJECTED, CANCELED).
	 * Currently: clean up abort-signal listeners to prevent unbounded listener accumulation.
	 */
	protected _runSettlementEffects(): void {
		// Release the settlement wrappers once the promise has settled — they close over the whole
		// executor scope (by far the largest per-instance retained cost) and can never be invoked
		// again after settlement (cancel()/resolve()/reject() are all no-ops on a settled promise).
		// `withResolvers` already captured its own references at construction time, so nulling
		// the fields here does not affect callers still holding the functions.
		this._resolve = undefined as any;
		this._reject = undefined as any;

		// Remove all registered abort listeners to prevent listener leaks when a promise settles
		// before its signal(s) abort. Both structures are absent unless a signal was wired, so the
		// common (no-signal) path does nothing here.
		const abortSignals = this._abortSignals;
		if (abortSignals) {
			const abortListeners = this._abortListeners!;
			for (const signal of abortSignals) {
				const listener = abortListeners.get(signal);
				if (listener) {
					signal.removeEventListener('abort', listener, { once: true });
					abortListeners.delete(signal);
				}
			}
			abortSignals.length = 0;
		}
	}

	protected _then<TResult1 = T, TResult2 = never>(onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null, onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): CancelablePromise<TResult1 | TResult2> {
		const This = this.constructor as typeof CancelablePromise;
		// Calls CancelablePromise constructor internally
		try {
			This._pendingInternalCall = true;
			return NativePromise.prototype.then.call(this, onFulfilled, onRejected) as CancelablePromise<TResult1>;
		} finally {
			This._pendingInternalCall = false;
		}
	}

	/**
	 * Bubble-count core shared by `_chain` and `_chainInput`. When this promise participates in
	 * bubbling (`bubble && cancelable`), raise its chain count by one and return the matching
	 * `onComplete` completion callback; the caller decides how that completion is wired (a child's
	 * `handleCancel`, a settle reaction, or a native subscription). Returns `undefined` when this
	 * promise does not bubble, so the caller skips wiring entirely.
	 *
	 * The completion semantics are identical to the previous inline `_chain` closure: on each
	 * completion increment `_completedChainsCount`, and once every counted ref has completed while
	 * still cancelable, bubble-cancel this promise with a `bubbled` CancelError.
	 */
	protected _addChainRef(bubbleOnComplete?: boolean): (() => void) | undefined {
		if (!(this.bubble && this.cancelable)) {
			return undefined;
		}

		this._chainsCount++;

		return () => {
			this._completedChainsCount++;

			if (this._completedChainsCount >= this._chainsCount && this.cancelable) {
				const error = new CancelError(`Bubbled on ${bubbleOnComplete ? 'settling' : 'cancel'}`);
				error.bubbled = true;

				this.cancel(error);
			}
		};
	}

	/**
	 * Internal settlement subscription: attach `onFulfilled`/`onRejected` reactions to this promise
	 * WITHOUT constructing a derived CancelablePromise. `NativePromise.prototype.then.call` is used
	 * with the species machinery NOT engaged (`_pendingInternalCall` stays false), so `new.target`
	 * inside the native then resolves to the native Promise constructor and the returned object is a
	 * plain native promise, never a canc species. The reactions still run at A+ timing and, because a
	 * rejection reaction is attached, this source counts as handled for the host (no unhandled
	 * rejection), exactly like the per-item `.then()` it replaces. The throwaway native promise is
	 * never returned to a caller nor chained.
	 */
	protected _subscribe(onFulfilled?: ((value: T) => any) | null, onRejected?: ((reason: any) => any) | null): void {
		NativePromise.prototype.then.call(this, onFulfilled as any, onRejected as any);
	}

	/**
	 * Connects the current and the next promise in the chain and propagates the cancelation to the parent promises
	 * @param childPromise The next promise in the chain
	 * @param bubbleOnComplete Makes the cancelation bubble on completion of the child promise, e.g. race()
	 */
	protected _chain(childPromise: CancelablePromise<any>, bubbleOnComplete?: boolean): void {
		const onComplete = this._addChainRef(bubbleOnComplete);
		if (!onComplete) {
			return;
		}

		if (bubbleOnComplete) {
			// Optimized finally
			childPromise.then(onComplete, onComplete);
		} else {
			childPromise.handleCancel(onComplete);
		}
	}

	/**
	 * Combinator per-item chain accounting without a species child. Reproduces the exact bubble-count
	 * effect the per-item `.then()`/`.then().catch()` plus `input._chain(resultPromise)` pair produces
	 * today, but with no derived canc promise: the input's count is raised once for the internal
	 * consumer (completed on the input's own cancel, matching a `handleCancel`-registered onComplete)
	 * and once for the result-as-child via the real `_chain(resultPromise)`. Keeping the input at the
	 * same total count preserves the "canceling the result does NOT cascade to inputs" oracle: a
	 * single completed ref never satisfies the count, so the input stays pending.
	 *
	 * @param resultPromise The combinator result promise (chained as this input's downstream child).
	 * @param bubbleOnComplete Race-style completion timing for the result chain (settle vs cancel).
	 */
	protected _chainInput(resultPromise: CancelablePromise<any>, bubbleOnComplete?: boolean): void {
		// Internal-consumer ref: same increment the per-item derived child raised via its own `_chain`.
		// Its completion is wired to THIS input's cancel (handleCancel), mirroring the old derived
		// child whose `onComplete` fired on that child's cancel, so it does not complete when the
		// result is canceled — the count-padding that keeps the input alive.
		const onComplete = this._addChainRef();
		if (onComplete) {
			this.handleCancel(onComplete);
		}

		// Result-as-child ref: unchanged real chain of the result promise onto this input.
		this._chain(resultPromise, bubbleOnComplete);
	}
}

// Capture global Promise. Read ONCE here, at module load, into a module-scope `const`, never
// replaced with a live `global.Promise`/`Promise` lookup anywhere else in this file. Rationale:
// some environments swap or wrap the global Promise AFTER this module has loaded (zone.js patches
// it for change detection, polyfill loaders may install a different implementation later, tests
// may stub it), if internal code re-read the live global on every use, CancelablePromise's
// behavior would silently depend on load-order / later patching instead of the Promise
// implementation that was actually present when this class was defined. Capturing once makes the
// dependency deterministic and testable (see "Native Promise capture" suite in
// cancelable-promise.spec.ts, which spies on the global getter and asserts it is never touched
// again after this line runs). Every native-Promise use below (Reflect.construct target,
// NativePromise.resolve/prototype.then.call, etc.) goes through this captured binding.
const NativePromise = Promise;

// Wires CancelablePromise into the Promise prototype/static chain WITHOUT
// `class CancelablePromise extends Promise` + `super()`, see the long comment on
// the Reflect.construct block above for why `super()` into native Promise cannot survive an
// ES5-target transpile. `Object.setPrototypeOf` reproduces the two links `extends` would have
// wired for us:
// - constructor chain: CancelablePromise inherits Promise's OWN static members (resolve/reject/
// all/race/etc. as fallbacks, and — key for species — the default `[Symbol.species]` getter
// that returns `this`, which is what makes the `declare`d species field above resolve
// correctly without any explicit getter of our own).
// - prototype chain: CancelablePromise.prototype inherits Promise.prototype (toString,
// Symbol.toStringTag getter, etc.) so instances still duck/brand-check as real Promises.
// Both links point at the CAPTURED `NativePromise`, not whatever `Promise` may be at this point in
// module evaluation, keeping this consistent with the capture above (a stray `Promise` here
// instead of `NativePromise` would silently reintroduce a live-global dependency).
Object.setPrototypeOf(CancelablePromise, NativePromise);

Object.setPrototypeOf(CancelablePromise.prototype, NativePromise.prototype);

// Duck-token brand: every instance (via the prototype) carries CANCEL_PROMISE_BRAND, so
// isCancPromise (helpers.ts) can identify a genuine canc CancelablePromise across realms/copies
// without `instanceof` (which fails across dual-package-hazard copies of this module).
Object.defineProperty(CancelablePromise.prototype, CANCEL_PROMISE_BRAND, {
	configurable: false,
	enumerable: false,
	writable: false,
	value: true
});

// Prototype defaults for the cold per-instance fields. Declaring these on the prototype (rather
// than initializing them in every constructor) means a promise that never chains, cancels, or takes
// the sync-cancel handoff carries none of them as own properties: reads fall through to these shared
// defaults and a write (e.g. `_chainsCount++`) materializes an own property only for the promises
// that actually diverge. This is the bulk of the per-instance shrink for the common resolved/
// rejected promise. Kept non-enumerable so it does not affect key enumeration / the `options` shape.
Object.defineProperties(CancelablePromise.prototype, {
	_chainsCount: { value: 0, writable: true, enumerable: false, configurable: true },
	_completedChainsCount: { value: 0, writable: true, enumerable: false, configurable: true },
	_pendingSyncCancel: { value: false, writable: true, enumerable: false, configurable: true },
	_pendingSyncCancelReason: { value: undefined, writable: true, enumerable: false, configurable: true },
	_canceledReason: { value: undefined, writable: true, enumerable: false, configurable: true },
	_isCanceledReasonSet: { value: false, writable: true, enumerable: false, configurable: true },
});

// Explicit Resource Management wiring. Feature-detected and attached at module load so there
// is ZERO footprint on runtimes without the symbols (es5/legacy engines): the prototype simply
// lacks the methods, `using`/`await using` isn't available there anyway, and the type-only fields
// keep the public surface stable. `_dispose` is the internal no-throw cancel (bypasses strict).
const SymbolDispose: symbol | undefined = (Symbol as any).dispose;
const SymbolAsyncDispose: symbol | undefined = (Symbol as any).asyncDispose;

if (typeof SymbolDispose === 'symbol') {
	// Sync disposal: fire-and-forget cancel — returns undefined.
	Object.defineProperty(CancelablePromise.prototype, SymbolDispose, {
		configurable: true,
		writable: true,
		value: function (this: CancelablePromise<any>): void {
			(this as any)._dispose();
		}
	});
}

if (typeof SymbolAsyncDispose === 'symbol') {
	// Async disposal: returns the handler-settlement promise so `await using` awaits cleanup.
	Object.defineProperty(CancelablePromise.prototype, SymbolAsyncDispose, {
		configurable: true,
		writable: true,
		value: function (this: CancelablePromise<any>): PromiseLike<unknown> {
			const result = (this as any)._dispose();
			// Always await-able: a no-op disposal (settled/shielded) returns undefined → normalize to
			// a resolved promise so `await using` never throws on scope exit.
			return result || NativePromise.resolve([]);
		}
	});
}

export { CancelablePromise };
