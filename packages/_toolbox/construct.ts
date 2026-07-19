/**
 * Minimal constructor shape every toolbox algorithm depends on: a promise implementation
 * constructible with an executor and an optional options bag. Native Promise ignores the options
 * argument and the executor's third parameter; CancelablePromise-shaped implementations consume
 * both. This type is local and erases fully, so this module carries no runtime dependency on any
 * concrete promise package.
 */
export type TPromiseCtor = (new (
	executor: (resolve: (value: any) => void, reject: (reason?: any) => void, handleCancel?: THandleCancel) => void,
	options?: object,
) => PromiseLike<any> & { cancelable?: boolean }) & {
	resolve<T>(value: T | PromiseLike<T>): PromiseLike<T>;
};

/**
 * A cancel registration callback, supplied to the executor as a third argument only by a
 * cancelable-shaped implementation. A plain native Promise calls the executor with two arguments,
 * so callers must feature-detect before use.
 */
export type THandleCancel = (onCancel: () => void) => void;

/**
 * The executor shape toolbox algorithms construct against. It widens the native
 * `(resolve, reject)` signature with the optional cancelable `handleCancel` argument so the same
 * executor works with either kind of implementation.
 */
export type TExecutor<T> = (
	resolve: (value: T | PromiseLike<T>) => void,
	reject: (reason?: any) => void,
	handleCancel?: THandleCancel,
) => void;

/**
 * Construct a promise from the given implementation, passing options through as the second
 * constructor argument. A native Promise ignores that argument; a cancelable implementation
 * consumes it. Centralizes the one unavoidable cast: `PromiseLike` does not model a third executor
 * argument or an options argument, but every concrete implementation accepts both (native by
 * ignoring them, cancelable by honoring them).
 */
export function construct<T>(Impl: TPromiseCtor, executor: TExecutor<T>, options?: object): PromiseLike<T> {
	const Ctor = Impl as unknown as new (executor: TExecutor<T>, options?: object) => PromiseLike<T>;

	return new Ctor(executor, options);
}
