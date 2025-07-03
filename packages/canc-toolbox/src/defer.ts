import { PromiseImpl } from '@cancjs/promise';
import { IToolboxOptions, resolveImpl } from './options';

/**
 * A settleable promise plus its resolve/reject functions, the classic deferred shape and the
 * ancestor of Promise.withResolvers. Provided for parity with promise-util collections; prefer the
 * implementation's own withResolvers when it exists.
 */
export interface IDeferred<T> {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: any) => void;
}

export function deferFactory(boundImpl?: PromiseImpl) {
	return function defer<T = void>(options?: IToolboxOptions): IDeferred<T> {
		const Impl = resolveImpl(options, boundImpl);
		let resolve!: (value: T | PromiseLike<T>) => void;
		let reject!: (reason?: any) => void;

		// withResolvers on the resolved implementation (native or canc) carries the options through
		// where supported; fall back to a constructor when an implementation lacks it. It is invoked
		// with Impl as the receiver because CancelablePromise.withResolvers does `new this(...)`.
		const withResolvers = (Impl as { withResolvers?: <U>(this: PromiseImpl, options?: IToolboxOptions) => IDeferred<U> }).withResolvers;

		if (typeof withResolvers === 'function') {
			return withResolvers.call(Impl, options) as IDeferred<T>;
		}

		const Ctor = Impl as unknown as new (
			executor: (res: (value: T | PromiseLike<T>) => void, rej: (reason?: any) => void) => void,
		) => Promise<T>;
		const promise = new Ctor((res, rej) => {
			resolve = res;
			reject = rej;
		});

		return { promise, resolve, reject };
	};
}

export const defer = deferFactory();
