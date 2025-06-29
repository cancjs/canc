import { createAggregateError, isFunction, isObject, isThenable } from '../../_util';
import { CancelError } from './cancel-error';
import { isCancelError } from './helpers';

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

export interface ICancelRef {
	cancel?: TCancelFn | null;
	readonly canceled?: boolean;
}

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
	ref?: ICancelRef;
	signal?: IAbortSignal | IAbortSignal[];
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

			for (const promiseOrValue of values) {
				const index = count++;
				const normalizedOptions = this._getOptions(options);
				const promise = this.resolve(promiseOrValue, normalizedOptions);
				inputs.push(promise);

				promise.then(
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

				promise._chain(resultsPromise);
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
		return this.all(
			[...values].map(promiseOrValue => {
				const normalizedOptions = this._getOptions(options);

				return this.resolve(promiseOrValue, normalizedOptions)
				.then(
					(value) => ({ status: 'fulfilled', value }),
					(reason) => ({ status: 'rejected', reason })
				) as CancelablePromise<PromiseSettledResult<any>>;
			}),
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

		try {
			for (const promiseOrValue of values) {
				const index = count++;
				const normalizedOptions = this._getOptions(options);
				const promise = this.resolve(promiseOrValue, normalizedOptions);
				inputs.push(promise);

				promise.then(value => {
					if (!hasFulfilled) {
						hasFulfilled = true;
						// Cancel-losers: on first fulfill, cancel all other pending inputs
						// that have bubble:true (doc: losers are canceled).
						this._cancelLosers(inputs, promise);
					}
					// value is T (unresolved-thenable element type), not yet Awaited<T> — same
					// looseness the previous `resultPromise._resolve(value)` (typed `any`) had.
					resolveResult(value as Awaited<T>);
				})
				.catch(error => {
					errors[index] = error;
					rejectedCount++;

					if (rejectedCount === count) {
						rejectResult(createAggregateError(errors, 'All promises were rejected'));
					}
				});

				promise._chain(resultPromise);
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

		try {
			for (const promiseOrValue of values) {
				const normalizedOptions = this._getOptions(options);
				const promise = this.resolve<T>(promiseOrValue, normalizedOptions)
				.then(resolveResult, rejectResult);

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
			cancel: promise.cancel,
		}
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

			if ('ref' in options) {
				mergedOptions.ref = options.ref || undefined;
			}

			if ('signal' in options) {
				mergedOptions.signal = options.signal || undefined;
			}
		}

		return mergedOptions;
	}

	protected static _checkOptionsChanged(instance: ICancelablePromiseOptions, options?: ICancelablePromiseOptions): boolean {
		if (!options) {
			return false;
		}

		const keys: Array<keyof ICancelablePromiseOptions> = ['asyncCancel', 'forceCancelable', 'bubble', 'strict', 'shield', 'ref', 'signal'];

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
			if (input !== winner && input.isCancelable && input.bubble && !input.shield) {

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

	asyncCancel!: boolean;
	forceCancelable!: boolean;
	bubble!: boolean;
	strict!: boolean;
	shield!: boolean;

	protected _resolve!: (value?: any) => void;
	protected _reject!: (reason?: any) => void;
	protected _cancelHandlers: TOnCancel[] = [];
	protected _chainsCount = 0;
	protected _completedChainsCount = 0;
	// Listener management for abort signals: maps each signal to its registered listener
	// function so we can remove it on settle. Supports both single signal and array.
	protected _abortSignals: IAbortSignal[] = [];
	protected _abortListeners = new Map<IAbortSignal, any>();
	// Reflect promise state via public fields
	protected _internalState: TCancelablePromiseStates = 'PENDING';
	// Set when an external CancelError rejection transitions the promise to CANCELED while
	// `instance` is still the temporary `this` (synchronous executor, before Reflect.construct
	// returns the real promise). Post-construct code then runs the deferred cancellation side
	// effects (rejection suppression + cancel-handler firing) on the real instance.
	protected _pendingSyncCancel = false;
	protected _pendingSyncCancelReason: any = undefined;
	// Retains the original cancel reason once canceled, so a late handleCancel({immediate:true})
	// registration can fire with the same reason.
	protected _canceledReason: any = undefined;
	protected _isCanceledReasonSet = false;

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
		// Flag set if a pre-aborted signal is detected; tells the executor's reject wrapper
		// to treat the first rejection as external CancelError for pre-abort handling.
		let preAbortedSignalReason: any = undefined;

		const normalizedOptions = This._getOptions(options);

		// Pre-check for aborted signals, if found, mark for deferred handling in reject wrapper.
		if (normalizedOptions.signal) {
			const signals = Array.isArray(normalizedOptions.signal) ? normalizedOptions.signal : [normalizedOptions.signal];
			const preAbortedSignal = signals.find(s => s.aborted);
			if (preAbortedSignal && !normalizedOptions.strict) {
				preAbortedSignalReason = preAbortedSignal.reason;
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
								if (normalizedOptions.forceCancelable) {
									value.then(
										value_ => {
											if (instance._internalState === states.PENDING) {
												instance._internalState = states.FULFILLED;
												instance._runSettlementEffects();
											}

											resolve_(value_);
										},
										reject);
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
						// Pre-aborted signal handling: if a pre-aborted signal was detected
						// during setup, the first rejection wraps signal.reason as cause in a
						// CancelError. Treat it as external CancelError for parity.
						if (preAbortedSignalReason !== undefined) {
							const wrappedError = new CancelError(undefined, { cause: preAbortedSignalReason });
							reason = wrappedError;
							preAbortedSignalReason = undefined;
						}

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

					// Pre-aborted signal: call the wrapper reject function (not reject_
					// directly) so the wrapping logic runs. Pass undefined; the wrapper will wrap
					// it as CancelError with cause = signal.reason.
					if (preAbortedSignalReason !== undefined) {
						reject(undefined);
					} else {
						executor(resolve, reject, handleCancel);
					}
				}) as TPromiseExecutor<T>
			],
			This
		) as CancelablePromise<T>;

		Object.assign(instance, this);

		instance.cancel = instance.cancel.bind(instance);

		// Flag options
		instance.bubble = normalizedOptions.bubble;
		instance.strict = normalizedOptions.strict;
		instance.asyncCancel = normalizedOptions.asyncCancel;
		instance.forceCancelable = normalizedOptions.forceCancelable;
		instance.shield = normalizedOptions.shield;

		const { ref, signal } = normalizedOptions;

		if (signal) {
			// Support both single signal and array of signals.
			const signals = Array.isArray(signal) ? signal : [signal];

			// Check for pre-aborted signals.
			const preAbortedSignal = signals.find(s => s.aborted);
			if (preAbortedSignal) {
				// strict:true throws; otherwise return already-canceled promise
				// (pre-check already detected and set preAbortedSignalReason flag).
				if (normalizedOptions.strict) {
					throw new Error('Aborted signal cannot be reused');
				}
				// Non-strict pre-abort: already handled by executor rejecting immediately.
			} else {
				// Non-aborted: register abort listeners for all signals (first-abort-wins).
				// Listener cleanup happens via _runSettlementEffects on settle.
				for (const sig of signals) {
					const onAbort = () => {
						instance.cancel(sig.reason);
					};

					instance._abortSignals.push(sig);
					instance._abortListeners.set(sig, onAbort);
					sig.addEventListener('abort', onAbort, { once: true });
				}
			}
		}

		if (ref) {
			if ('canceled' in ref) {
				throw new Error('Cancel ref cannot be reused');
			} else {
				Object.defineProperty(ref, 'canceled', {
					configurable: true,
					get: () => {
						return instance.isCanceled;
					}
				});

				ref.cancel = instance.cancel;
			}
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

	get isCanceled(): boolean {
		return this._internalState === states.CANCELED;
	}

	get isCancelable(): boolean {
		// Settled-ness is derived purely from the internal state machine now. A promise is
		// cancelable only while genuinely PENDING; FORCE_PENDING (forceCancelable:false adoption),
		// FULFILLED, REJECTED and CANCELED are all non-cancelable.
		return this._internalState === states.PENDING;
	}

	/**
	 * Attaches callbacks for the resolution and/or rejection of the Promise.
	 * @param onFulfilled The callback to execute when the Promise is resolved.
	 * @param onRejected The callback to execute when the Promise is rejected.
	 * @returns A Promise for the completion of which ever callback is executed.
	 */
	then<TResult1 = T, TResult2 = never>(onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null, onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): CancelablePromise<TResult1 | TResult2> {
		const This = this.constructor as typeof CancelablePromise;
		const normalizedOptions = This._getOptions(this);
		// Shield is per-node and never inherited by then-derived children: a child of a shielded
		// promise is itself normally cancelable.
		normalizedOptions.shield = false;
		const promise = This.resolve(
			this._then(onFulfilled, onRejected),
			normalizedOptions
		);

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
		if (this.isCancelable) {
			if (isFunction(onCancel) && !this._cancelHandlers.includes(onCancel)) {
				this._cancelHandlers.push(onCancel);
			}
		} else if (options && options.immediate && this.isCanceled) {
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
			throw new Error(`${this.isCanceled ? 'Canceled' : 'Settled'} promise cannot add cancel handler`);
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
	 * On an already-settled/canceled promise this is a silent no-op unless `strict`, which throws.
	 * @param reason The cancellation reason.
	 */
	cancel(reason?: any): void | CancelablePromise<PromiseSettledResult<unknown>[]> {
		// Shield: a shielded promise protects its own pending work from cancelation initiated
		// from below/outside — a direct cancel() is a silent no-op (strict → throw), and a
		// bubble-cancel from children (which arrives via this same cancel() call in _chain) is
		// stopped here. Down-propagation is untouched: an upstream cancel/reject reaches this
		// promise through the _reject wrapper, not through cancel(), so shielded nodes still settle.
		if (this.shield && this.isCancelable) {
			if (this.strict) {
				throw new Error('Shielded promise cannot be canceled');
			}

			return;
		}

		if (this.isCancelable) {
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
			this._reject(error);

			// Settlement effects (listener cleanup) are already called in the reject wrapper
			// after state transition (reject() is synchronous), but call again to ensure
			// cleanup on cancel path. The map-based tracking prevents double-cleanup.
			this._runSettlementEffects();

			return this._runCancellation(reason);
		} else if (this.strict) {
			throw new Error(`${this.isCanceled ? 'Canceled' : 'Settled'} promise cannot be canceled`);
		}
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
		// Shielded or already-settled/canceled → silent no-op (never throw, unlike cancel() strict).
		if (this.shield || !this.isCancelable) {
			return;
		}

		const error = new CancelError('Disposed');
		error.isDisposed = true;

		this._internalState = states.CANCELED;
		this._reject(error);
		this._runSettlementEffects();

		return this._runCancellation(error);
	}

	/**
	 * Cancellation side effects shared by cancel() and the external-CancelError reject path:
	 * suppresses the promise's own unhandled rejection and fires registered cancel handlers.
	 * State (CANCELED) must already be set by the caller.
	 */
	protected _runCancellation(reason?: any): void | CancelablePromise<PromiseSettledResult<unknown>[]> {
		// Retain the original reason for late immediate handlers.
		this._canceledReason = reason;
		this._isCanceledReasonSet = true;

		// Suppress uncaught rejection (targeted — only for canceled promises).
		this.catch(noop);

		const This = this.constructor as typeof CancelablePromise;

		if (this.asyncCancel) {
			// Always-return contract: asyncCancel resolves to the settlement of all cancel
			// handlers. With no handlers this is an empty allSettled, still a promise, so callers
			// (and Symbol.asyncDispose) can uniformly await cancellation completion.
			const handlerPromises = this._cancelHandlers.map(
				handler => new This(resolve => resolve(handler(reason)))
			);

			this._cancelHandlers.length = 0;

			return This.allSettled(handlerPromises);
		} else {
			// Sync mode returns undefined (documented split): handlers fire synchronously and any
			// throw would surface immediately, so there is nothing to await.
			if (this._cancelHandlers.length) {
				try {
					for (const handler of this._cancelHandlers) {
						handler(reason);
					}
				} finally {
					this._cancelHandlers.length = 0;
				}
			}
		}
	}

	/**
	 * Settlement side effects run whenever the promise settles (any way: FULFILLED, REJECTED, CANCELED).
	 * Currently: clean up abort-signal listeners to prevent unbounded listener accumulation.
	 */
	protected _runSettlementEffects(): void {
		// Remove all registered abort listeners to prevent listener leaks when a promise settles
		// before its signal(s) abort.
		for (const signal of this._abortSignals) {
			const listener = this._abortListeners.get(signal);
			if (listener) {
				signal.removeEventListener('abort', listener, { once: true });
				this._abortListeners.delete(signal);
			}
		}
		this._abortSignals.length = 0;
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
 * Connects the current and the next promise in the chain and propagates the cancelation to the parent promises
 * @param childPromise The next promise in the chain
 * @param bubbleOnComplete Makes the cancelation bubble on completion of the child promise, e.g. race()
 */
	protected _chain(childPromise: CancelablePromise<any>, bubbleOnComplete?: boolean): void {
		if (this.bubble && this.isCancelable) {
			this._chainsCount++;
			// console.log('chains', this._chainsCount, this._completedChainsCount);

			const onComplete = () => {
				this._completedChainsCount++;

				if (this._completedChainsCount >= this._chainsCount && this.isCancelable) {
					const error = new CancelError(`Bubbled on ${bubbleOnComplete ? 'settling' : 'cancel'}`);
					error.isBubbled = true;

					 
					this.cancel(error);
				}
			};

			if (bubbleOnComplete) {
				// Optimized finally
				childPromise.then(onComplete, onComplete);
			} else {
				childPromise.handleCancel(onComplete);
			}
		}
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
