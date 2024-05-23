import { isCancelable, isFunction, isObject } from '../../_util';
import { CancelError, isCancelError } from './cancel-error';


export type TPromiseExecutor<T> = (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void;
export type TCancelablePromiseExecutor<T> = (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any) => void, handleCancel: (onCancel: TOnCancel) => void) => void;
export type TCancelReason = string | object | CancelError;
export type TCancelFn = (reason?: TCancelReason) => void;
export type TOnCancel = TCancelFn;
export type TCancelRefObj = { cancel?: TCancelFn | null };
export type TCancelRef = ((onCancel: TOnCancel) => void) | { cancel?: TCancelFn | null };

export type TCancelablePromiseChainOptions = {
	asyncCancel?: boolean;
	bubble?: boolean;
	strict?: boolean;
};

export type TCancelablePromiseOptions = TCancelablePromiseChainOptions & {
	onCancel?: TOnCancel;
	cancelRef?: TCancelRef;
};

export interface ICancelable<T = any> extends PromiseLike<T> {
	cancel(reason?: any): any;
}

export interface ICancelablePromiseWithResolvers<T> {
    promise: CancelablePromise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: any) => void;
		cancel: (reason?: any) => void | CancelablePromise<PromiseSettledResult<unknown>[]>
}

// Extends PromiseConstructor interface, as defined in
// lib.es2015.promise, lib.es2015.iterable, lib.es2015.symbol.wellknown, lib.es2018.promise, lib.es2020.promise, lib.es2021.promise.d.ts, lib.esnext.promise.d.ts
export interface ICancelablePromiseConstructor extends PromiseConstructor {
	readonly [Symbol.species]: PromiseConstructor;

	readonly prototype: CancelablePromise<any>;

	/**
	 * Creates a new Promise.
	 * @param executor A callback used to initialize the promise.
	 */
	new <T>(executor: TCancelablePromiseExecutor<T>, options?: TCancelablePromiseOptions): CancelablePromise<T>;

	/**
	 * Creates a Promise that is resolved with an array of results when all of the provided Promises
	 * resolve, or rejected when any Promise is rejected.
	 * @param values An array of Promises.
	 * @returns A new Promise.
	 */
	all<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>, T9 | PromiseLike<T9>, T10 | PromiseLike<T10>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
	all<T1, T2, T3, T4, T5, T6, T7, T8, T9>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>, T9 | PromiseLike<T9>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
	all<T1, T2, T3, T4, T5, T6, T7, T8>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7, T8]>;
	all<T1, T2, T3, T4, T5, T6, T7>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7]>;
	all<T1, T2, T3, T4, T5, T6>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6]>;
	all<T1, T2, T3, T4, T5>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>, T5 | PromiseLike<T5>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5]>;
	all<T1, T2, T3, T4>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike <T4>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4]>;
	all<T1, T2, T3>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3]>;
	all<T1, T2>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2]>;
	all<T>(values: readonly (T | PromiseLike<T>)[], options?: TCancelablePromiseOptions): CancelablePromise<T[]>;
	all<TAll>(values: Iterable<TAll | PromiseLike<TAll>>, options?: TCancelablePromiseOptions): CancelablePromise<TAll[]>;

	/**
	 * Creates a Promise that is resolved with an array of results when all
	 * of the provided Promises resolve or reject.
	 * @param values An array of Promises.
	 * @returns A new Promise.
	 */
	allSettled<T extends readonly unknown[] | readonly [unknown]>(values: T, options?: TCancelablePromiseOptions): CancelablePromise<{ -readonly [P in keyof T]: PromiseSettledResult<T[P] extends PromiseLike<infer U> ? U : T[P]> }>;
	allSettled<T>(values: Iterable<T>, options?: TCancelablePromiseOptions): CancelablePromise<PromiseSettledResult<T extends PromiseLike<infer U> ? U : T>[]>;

	/**
	 * The any function returns a promise that is fulfilled by the first given promise to be fulfilled, or rejected with an AggregateError containing an array of rejection reasons if all of the given promises are rejected. It resolves all elements of the passed iterable to promises as it runs this algorithm.
	 * @param values An array or iterable of Promises.
	 * @returns A new Promise.
	 */
	any<T extends readonly unknown[] | []>(values: T): CancelablePromise<Awaited<T[number]>>;
	any<T>(values: Iterable<T | PromiseLike<T>>): CancelablePromise<Awaited<T>>;

	/**
	 * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
	 * or rejected.
	 * @param values An array of Promises.
	 * @returns A new Promise.
	 */
	race<T>(values: readonly T[], options?: TCancelablePromiseOptions): CancelablePromise<T extends PromiseLike<infer U> ? U : T>;
	race<T>(values: Iterable<T>, options?: TCancelablePromiseOptions): CancelablePromise<T extends PromiseLike<infer U> ? U : T>;
	race<T>(values: Iterable<T | PromiseLike<T>>, options?: TCancelablePromiseOptions): CancelablePromise<T>;

	/**
	 * Creates a new rejected promise for the provided reason.
	 * @param reason The reason the promise was rejected.
	 * @returns A new rejected Promise.
	 */
	reject<T = never>(reason?: any, options?: TCancelablePromiseOptions): CancelablePromise<T>;

	/**
	 * Creates a new resolved promise for the provided value.
	 * @param value A promise.
	 * @returns A promise whose internal state matches the provided promise.
	 */
	resolve<T>(value: T | PromiseLike<T>, options?: TCancelablePromiseOptions): CancelablePromise<T>;
	resolve(): CancelablePromise<void>;

	/**
	 * Creates a new Promise and returns it in an object, along with its resolve and reject functions.
	 * @returns An object with the properties `promise`, `resolve`, and `reject`.
	 */
	withResolvers<T>(): ICancelablePromiseWithResolvers<T>;
}

function noop() {/**/}

class CancelablePromise<T> implements ICancelable<T>, Promise<T> {
	static readonly [Symbol.species]: PromiseConstructor;

	protected static _defaultOptions: Required<TCancelablePromiseChainOptions> = {
		asyncCancel: true,
		bubble: true,
		strict: false
	};

	static all<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>, T9 | PromiseLike<T9>, T10 | PromiseLike<T10>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]>;
	static all<T1, T2, T3, T4, T5, T6, T7, T8, T9>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>, T9 | PromiseLike<T9>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
	static all<T1, T2, T3, T4, T5, T6, T7, T8>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>, T8 | PromiseLike<T8>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7, T8]>;
	static all<T1, T2, T3, T4, T5, T6, T7>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>, T7 | PromiseLike<T7>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6, T7]>;
	static all<T1, T2, T3, T4, T5, T6>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>, T5 | PromiseLike<T5>, T6 | PromiseLike<T6>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5, T6]>;
	static all<T1, T2, T3, T4, T5>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>, T5 | PromiseLike<T5>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4, T5]>;
	static all<T1, T2, T3, T4>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>, T4 | PromiseLike<T4>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3, T4]>;
	static all<T1, T2, T3>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>, T3 | PromiseLike<T3>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2, T3]>;
	static all<T1, T2>(values: readonly [T1 | PromiseLike<T1>, T2 | PromiseLike<T2>], options?: TCancelablePromiseOptions): CancelablePromise<[T1, T2]>;
	static all<T>(values: readonly (T | PromiseLike<T>)[], options?: TCancelablePromiseOptions): CancelablePromise<T[]>;
	static all<TAll>(values: Iterable<TAll | PromiseLike<TAll>>, options?: TCancelablePromiseOptions): CancelablePromise<TAll[]>;

	static all<TAll>(values: Iterable<TAll | PromiseLike<TAll>>, options?: TCancelablePromiseOptions): CancelablePromise<TAll[]> {
		// A deferred to work around referring to the promise in executor
		const resultsPromise = new this<TAll[]>(noop, options);

		try {
			const results: TAll[] = [];
			let count = 0;

			for (const promiseOrValue of values) {
				const index = count++;
				const chainOptions = this._getChainOptions(options);
				const promise = this.resolve(promiseOrValue, chainOptions)
					.then(
						(value) => {
							results[index] = value;

							if (!--count) {
								resultsPromise._resolve(results);
							}
						},
						resultsPromise._reject
					);

				promise._chain(resultsPromise);
			}

			if (!count) {
				resultsPromise._resolve(results);
			}
		} catch (error) {
			resultsPromise._reject(error);
		}

		return resultsPromise;
	}

	static allSettled<T extends readonly unknown[] | readonly [unknown]>(values: T, options?: TCancelablePromiseOptions): CancelablePromise<{ -readonly [P in keyof T]: PromiseSettledResult<T[P] extends PromiseLike<infer U> ? U : T[P]> }>;
	static allSettled<T>(values: Iterable<T>, options?: TCancelablePromiseOptions): CancelablePromise<PromiseSettledResult<T extends PromiseLike<infer U> ? U : T>[]>;

	static allSettled<T>(values: Iterable<T>, options?: TCancelablePromiseOptions): CancelablePromise<PromiseSettledResult<any>[] | { [P in keyof any]: PromiseSettledResult<any> }> {
		return this.all(
			[...values].map(promiseOrValue => {
				const chainOptions = this._getChainOptions(options);

				return this.resolve(promiseOrValue, chainOptions)
					.then(
						(value) => ({status: 'fulfilled', value}),
						(reason) => ({status: 'rejected', reason})
					) as CancelablePromise<PromiseSettledResult<any>>;
			}),
			options
		);
	}

	static any<T extends readonly unknown[] | []>(values: T, options?: TCancelablePromiseOptions): CancelablePromise<Awaited<T[number]>>;
	static any<T>(values: Iterable<T | PromiseLike<T>>, options?: TCancelablePromiseOptions): CancelablePromise<Awaited<T>>;

	static any<T>(values: Iterable<T | PromiseLike<T>>, options?: TCancelablePromiseOptions): CancelablePromise<Awaited<T>> {
		const resultPromise = new this<Awaited<T>>(noop, options);

		const errors: Error[] = [];
		let count = 0;

		try {
			for (const promiseOrValue of values) {
				count++;
				const chainOptions = this._getChainOptions(options);
				const promise = this.resolve(promiseOrValue, chainOptions)
					.then(value => {
						resultPromise._resolve(value);
					})
					.catch(error => {
						errors.push(error);

						if (errors.length === count) {
							resultPromise._reject(new AggregateError(errors));
						}
					});

				promise._chain(resultPromise);
			}

			if (!count) {
				resultPromise._reject(new AggregateError(errors));
			}
		} catch (error) {
			resultPromise._reject(error);
		}

		return resultPromise;
	}

	static race<T>(values: readonly T[], options?: TCancelablePromiseOptions): CancelablePromise<T extends PromiseLike<infer U> ? U : T>;
	static race<T>(values: Iterable<T>, options?: TCancelablePromiseOptions): CancelablePromise<T extends PromiseLike<infer U> ? U : T>;
	static race<T>(values: Iterable<T | PromiseLike<T>>, options?: TCancelablePromiseOptions): CancelablePromise<T>;

	static race<T>(values: Iterable<T | PromiseLike<T>>, options?: TCancelablePromiseOptions): CancelablePromise<T> {
		// A deferred to work around referring to the promise in executor
		const resultPromise = new this<T>(noop, options);

		try {
			for (const promiseOrValue of values) {
				const chainOptions = this._getChainOptions(options);
				const promise = this.resolve<T>(promiseOrValue, chainOptions)
				.then(resultPromise._resolve, resultPromise._reject);

				promise._chain(resultPromise, true);
			}
		} catch (error) {
			resultPromise._reject(error);
		}

		return resultPromise;
	}

	static reject<T = never>(reason?: any, options?: TCancelablePromiseOptions): CancelablePromise<T> {
		return new this(
			(_resolve, reject) => {
				reject(reason);
			},
			options
		);
	}

	static resolve<T>(value: T | PromiseLike<T>, options?: TCancelablePromiseOptions): CancelablePromise<T>;
	static resolve(): CancelablePromise<void>;

	static resolve<T>(value?: T | PromiseLike<T>, options?: TCancelablePromiseOptions): CancelablePromise<T> {
		// TODO: compare options
		if (value instanceof this && value.constructor === this && !options) {
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

	static withResolvers<T>(options?: TCancelablePromiseOptions): ICancelablePromiseWithResolvers<T> {
		const promise = new this<T>(noop, options);

		return {
			promise,
			resolve: promise._resolve,
			reject: promise._reject,
			cancel: promise.cancel,
		}
	}

	protected static _getChainOptions(options?: TCancelablePromiseChainOptions): Required<TCancelablePromiseChainOptions> {
		const chainOptions = { ...this._defaultOptions };

		if (options) {
			if ('bubble' in options) {
				chainOptions.bubble = !!options.bubble;
			}

			if ('strict' in options) {
				chainOptions.strict = !!options.strict;
			}

			if ('asyncCancel' in options) {
				chainOptions.asyncCancel = !!options.asyncCancel;
			}
		}

		return chainOptions;
	}

	readonly [Symbol.toStringTag]!: string;

	asyncCancel!: boolean;
	bubble!: boolean;
	strict!: boolean;

	protected _resolve!: (value?: any) => void;
	protected _reject!: (reason?: any) => void;
	protected _cancelHandlers: TOnCancel[] = [];
	protected _chainsCount = 0;
	protected _completedChainsCount = 0;
	protected _isCanceled = false;
	protected _isSettled = false;

	constructor(executor: TCancelablePromiseExecutor<T>, options?: TCancelablePromiseOptions) {
		if (!(this instanceof CancelablePromise)) {
			throw new TypeError(`CancelablePromise constructor cannot be invoked without 'new'`);
		}

		this.handleCancel = this.handleCancel.bind(this);

		this.cancel = this.cancel.bind(this);

		// Chain options
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		Object.assign(this, new.target._getChainOptions(options));

		// Instance options
		if (options) {
			const { cancelRef } = options;

			// TODO: ref isCanceled state
			if (isFunction(cancelRef)) {
				cancelRef(this.cancel);
			} else if (isObject(cancelRef)) {
				if (cancelRef.cancel) {
					throw new Error('Cancel ref cannot be reused');
				} else {
					cancelRef.cancel = this.cancel;
				}
			}
		}

		// eslint-disable-next-line no-constructor-return
		return Reflect.construct(
			_Promise,
			[
				((resolve, reject) => {
					this._resolve = resolve;
					this._reject = reject;
					executor(resolve, reject, this.handleCancel);
				}) as TPromiseExecutor<T>
			],
			new.target
		)
		// TODO?: force bubble
		.then(
			(value: any) => {
				this._isSettled = true;
				return value;
			},
			(reason: any) => {
				this._isSettled = true;
				throw reason;
			}
		) as CancelablePromise<T>;
	}

	get isCanceled(): boolean {
		return this._isCanceled;
	}

	get isCancelable(): boolean {
		return !this._isSettled && !this._isCanceled;
	}

	then<TResult1 = T, TResult2 = never>(onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): CancelablePromise<TResult1 | TResult2> {
		const This = this.constructor as typeof CancelablePromise;
		const chainOptions = This._getChainOptions(this);
		const promise = This.resolve(
			_Promise.prototype.then.call(this, onFulfilled, onRejected) as Promise<TResult1>,
			chainOptions
		);

		this._chain(promise);

		return promise;
	}

	catch<TResult = never>(onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): CancelablePromise<T | TResult> {
		return this.then(null, onRejected);
	}

	finally(onFinally?: (() => void) | undefined | null): CancelablePromise<T> {
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

	handleCancel(onCancel: TOnCancel): CancelablePromise<T> {
		if (this.isCancelable) {
			if (isFunction(onCancel) && !this._cancelHandlers.includes(onCancel)) {
				this._cancelHandlers.push(onCancel);
			}
		} else if (this.strict) {
			throw new Error(`${this.isCanceled ? 'Canceled' : 'Settled'} promise cannot add cancel handler`);
		}

		return this;
	}

	cancel(reason?: any): void | CancelablePromise<PromiseSettledResult<unknown>[]> {
		if (this.isCancelable) {
			this._isCanceled = true;

			const error = isObject(reason) ? reason : new CancelError(reason);
			this._reject(error);

			// Suppress uncaught rejection
			this.catch(noop);

			if (this._cancelHandlers.length) {
				const This = this.constructor as typeof CancelablePromise;

				if (this.asyncCancel) {
					const handlerPromises = this._cancelHandlers.map(
						handler => new This(resolve => resolve(handler(reason)))
					);

					this._cancelHandlers.length = 0;

					return This.allSettled(handlerPromises);
				} else {
					try {
						for (const handler of this._cancelHandlers) {
							handler(reason);
						}
					} finally {
						this._cancelHandlers.length = 0;
					}
				}
			}
		} else if (this.strict) {
			throw new Error(`${this.isCanceled ? 'Canceled' : 'Settled'} promise cannot be canceled`);
		}
	}

	protected _chain(childPromise: CancelablePromise<any>, bubbleOnComplete?: boolean): void {
		if (this.bubble && this.isCancelable) {
			this._chainsCount++;
			// console.log('chains', this._chainsCount, this._completedChainsCount);

			const onComplete = () => {
				this._completedChainsCount++;

				if (this._completedChainsCount >= this._chainsCount && this.isCancelable) {
					const error = new CancelError(`Bubbled on ${bubbleOnComplete ? 'settling' : 'cancel'}`);
					error.isBubbled = true;
  
					// eslint-disable-next-line @typescript-eslint/no-floating-promises
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

// Capture global Promise
const _Promise = Promise;

Object.setPrototypeOf(CancelablePromise, _Promise);

Object.setPrototypeOf(CancelablePromise.prototype, _Promise.prototype);

export function forceCancelable<T>(promise: PromiseLike<T>, options?: TCancelablePromiseOptions): CancelablePromise<T> {
	return new CancelablePromise(
		(resolve, _reject, handleCancel) => {
			handleCancel((reason?: any) => {
				if (isCancelable(promise)) {
					promise.cancel(reason);
				}
			});

			resolve(promise);
		},
		options
	);
}

export { CancelablePromise };

export function createCancelRef(): TCancelRefObj {
	return { cancel: null };
}

export function catchCancel<T extends any>(error: T): CancelError | never {
	if (isCancelError(error)) {
		return error;
	} else {
		throw error;
	}
}

export function suppressCancel<T extends any>(error: T): void | never {
	if (!isCancelError(error)) {
		throw error;
	}
}
