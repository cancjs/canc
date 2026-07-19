import { TPromiseCtor } from './construct';

/**
 * A settleable promise plus its resolve/reject functions, the classic deferred shape and the
 * ancestor of Promise.withResolvers.
 */
export interface IDeferred<T> {
	promise: PromiseLike<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: any) => void;
}

/**
 * Build a deferred against `Impl`. Uses `Impl.withResolvers` when present (invoked with `Impl` as
 * the receiver, since a cancelable implementation's withResolvers does `new this(...)`), so
 * per-call options carry through; falls back to a constructor when the implementation lacks it.
 */
export function defer<T = void>(Impl: TPromiseCtor, options?: object): IDeferred<T> {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: any) => void;

	const withResolvers = (Impl as unknown as { withResolvers?: (this: TPromiseCtor, options?: object) => IDeferred<any> })
		.withResolvers;

	if (typeof withResolvers === 'function') {
		return withResolvers.call(Impl, options) as IDeferred<T>;
	}

	const Ctor = Impl as unknown as new (
		executor: (res: (value: T | PromiseLike<T>) => void, rej: (reason?: any) => void) => void,
	) => PromiseLike<T>;
	const promise = new Ctor((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}
