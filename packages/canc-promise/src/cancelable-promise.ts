import { isCancelable, isFunction, isObject } from '../../_util';
import { CancelError } from './cancel-error';
import { isCancelError } from './helpers';

export type TPromiseExecutor<T> = (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void;
export type TCancelablePromiseExecutor<T> = (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any) => void, handleCancel: (onCancel: TOnCancel) => void) => void;
export type TCancelReason = string | object | CancelError;
export type TCancelFn = (reason?: TCancelReason) => void;
export type TOnCancel = TCancelFn;

export interface ICancelRef {
	cancel?: TCancelFn | null;
	readonly canceled?: boolean;
}

export interface ICancelablePromiseFlagOptions {
	asyncCancel?: boolean;
	bubble?: boolean;
	strict?: boolean;
}

export interface ICancelablePromiseOptions extends ICancelablePromiseFlagOptions {
	ref?: ICancelRef;
	signal?: IAbortSignal;
}

interface IAbortEvent {
	type: 'abort';
	target: IAbortSignal;
}

interface IAbortEventListener {
	(e: IAbortEvent): void;
}

interface IAbortEventListenerObject {
	handleEvent(e: IAbortEvent): void;
}

type TAbortEventListenerOrObject = IAbortEventListener | IAbortEventListenerObject;

interface IAbortSignal {
	readonly aborted: boolean;
	readonly reason: any;
	onabort: ((this: IAbortSignal, ev: IAbortEvent) => any) | null;
	throwIfAborted(): void;
	addEventListener(type: 'abort', listener: TAbortEventListenerOrObject, options?: unknown): void;
	removeEventListener(type: 'abort', listener: TAbortEventListenerOrObject, options?: unknown): void;
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

// Extends PromiseConstructor, as defined in
// lib.es2015.promise, lib.es2015.iterable, lib.es2015.symbol.wellknown, lib.es2018.promise, lib.es2020.promise, lib.es2021.promise.d.ts, lib.esnext.promise.d.ts
class CancelablePromise<T> implements ICancelable<T>, Promise<T> {
	static readonly [Symbol.species]: PromiseConstructor;

  protected static _pendingInternalCall= false;

	protected static _defaultOptions: Required<ICancelablePromiseFlagOptions> = {
		asyncCancel: true,
		bubble: true,
		strict: false
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
		// A deferred to work around referring to the promise in executor
		const resultsPromise = new this<TAll[]>(noop, options);

		try {
			const results: TAll[] = [];
			let count = 0;

			for (const promiseOrValue of values) {
				const index = count++;
				const normalizedOptions = this._getOptions(options);
				const promise = this.resolve(promiseOrValue, normalizedOptions)
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
						(value) => ({status: 'fulfilled', value}),
						(reason) => ({status: 'rejected', reason})
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
		const resultPromise = new this<Awaited<T>>(noop, options);

		const errors: Error[] = [];
		let count = 0;

		try {
			for (const promiseOrValue of values) {
				count++;
				const normalizedOptions = this._getOptions(options);
				const promise = this.resolve(promiseOrValue, normalizedOptions)
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
		// A deferred to work around referring to the promise in executor
		const resultPromise = new this<T>(noop, options);

		try {
			for (const promiseOrValue of values) {
				const normalizedOptions = this._getOptions(options);
				const promise = this.resolve<T>(promiseOrValue, normalizedOptions)
				.then(resultPromise._resolve, resultPromise._reject);

				promise._chain(resultPromise, true);
			}
		} catch (error) {
			resultPromise._reject(error);
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
		const mergedOptions: ICancelablePromiseOptions & Required<ICancelablePromiseFlagOptions> = { ...this._defaultOptions };

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

		const keys: Array<keyof ICancelablePromiseOptions> = ['asyncCancel', 'bubble', 'strict', 'ref', 'signal'];

		for (const key of keys) {
			if (options[key] !== undefined && instance[key] !== options[key]) {
				return true;
			}
		}

		return false;
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
	protected _signal?: IAbortSignal;

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
		// Synchronous calls in executor
		let handleCancelFn = this.handleCancel.bind(this);

		// Compatible with ES5 transpilation target
		// eslint-disable-next-line no-constructor-return
		const instance = Reflect.construct(
			NativePromise,
			[
				((resolve, reject) => {
					this._resolve = resolve;
					this._reject = reject;

					function handleCancel(onCancel: TOnCancel): CancelablePromise<T>  {
						return handleCancelFn(onCancel);
					}

					executor(resolve, reject, handleCancel);
				}) as TPromiseExecutor<T>
			],
			This
		) as CancelablePromise<T>;

		// Asynchronous calls in executor
		// cancelHandlers are shared between `this` and `instance`
		handleCancelFn = instance.handleCancel.bind(instance);

		// Avoid recursive call in the constructor from .then
		if (!This._pendingInternalCall) {
			const onFinally = () => {
				instance._isSettled = true;
			};

			instance._then(onFinally, onFinally);
		}

		Object.assign(instance, this);

		instance.cancel = instance.cancel.bind(instance);

		const normalizedOptions = This._getOptions(options);

		// Flag options
		instance.bubble = normalizedOptions.bubble;
		instance.strict = normalizedOptions.strict;
		instance.asyncCancel = normalizedOptions.asyncCancel;

		const { ref, signal} = normalizedOptions;

		if (signal) {
			if (signal.aborted) {
				throw new Error('Aborted signal cannot be reused');
			} else {
				instance._signal = signal;

				const onAbort = (e: IAbortEvent) => {
					instance.cancel(signal.reason);
				};

				instance.handleCancel(() => {
					signal.removeEventListener('abort', onAbort);
				});

				signal.addEventListener('abort', onAbort, { once: true });
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

		return instance;
	}

	get isCanceled(): boolean {
		return this._isCanceled;
	}

	get isCancelable(): boolean {
		return !this._isSettled && !this._isCanceled;
	}

	/**
	 * Attaches callbacks for the resolution and/or rejection of the Promise.
	 * @param onFulfilled The callback to execute when the Promise is resolved.
	 * @param onRejected The callback to execute when the Promise is rejected.
	 * @returns A Promise for the completion of which ever callback is executed.
	 */
	then<TResult1 = T, TResult2 = never>(onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): CancelablePromise<TResult1 | TResult2> {
		const This = this.constructor as typeof CancelablePromise;
		const normalizedOptions = This._getOptions(this);
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
	catch<TResult = never>(onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): CancelablePromise<T | TResult> {
		return this.then(null, onRejected);
	}

	/**
	 * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
	 * resolved value cannot be modified from the callback.
	 * @param onFinally The callback to execute when the Promise is settled (fulfilled or rejected).
	 * @returns A Promise for the completion of the callback.
	 */
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

	protected _then<TResult1 = T, TResult2 = never>(onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): CancelablePromise<TResult1 | TResult2> {
		const This = this.constructor as typeof CancelablePromise;
		// Calls CancelablePromise constructor internally
		try {
			This._pendingInternalCall = true;
			return NativePromise.prototype.then.call(this, onFulfilled, onRejected) as CancelablePromise<TResult1>;
		} finally {
			This._pendingInternalCall = false;
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
const NativePromise = Promise;

Object.setPrototypeOf(CancelablePromise, NativePromise);

Object.setPrototypeOf(CancelablePromise.prototype, NativePromise.prototype);

export { CancelablePromise };
