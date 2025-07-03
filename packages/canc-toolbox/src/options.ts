import { ICancelablePromiseOptions, IPromiseImplOptions, PromiseImpl, resolvePromiseImpl } from '@cancjs/promise';

/**
 * Options accepted by every toolbox utility. `impl` is the highest-precedence promise
 * implementation override (see resolvePromiseImpl); the remaining canc options are forwarded to
 * CancelablePromise construction when the resolved implementation is CancelablePromise-shaped and
 * ignored by a plain native Promise.
 */
export interface IToolboxOptions extends IPromiseImplOptions, ICancelablePromiseOptions {}

/**
 * A cancel registration callback, supplied to the executor as a third argument only by
 * CancelablePromise. Native Promise calls the executor with two arguments, so consumers must
 * feature-detect before use.
 */
export type THandleCancel = (onCancel: () => void) => void;

/**
 * The executor shape toolbox utilities construct against. It widens the native
 * `(resolve, reject)` signature with the optional CancelablePromise `handleCancel` argument so the
 * same executor works with either implementation.
 */
export type TToolboxExecutor<T> = (
	resolve: (value: T | PromiseLike<T>) => void,
	reject: (reason?: any) => void,
	handleCancel?: THandleCancel,
) => void;

/**
 * Construct a promise from the resolved implementation, passing the canc options through as the
 * second constructor argument. Native Promise ignores that argument; CancelablePromise consumes it.
 * Centralizes the single unavoidable cast: `PromiseConstructor` (the D13c BYOP type) does not model
 * the third executor argument or the options argument, but every concrete implementation accepts
 * both (native by ignoring them, canc by honoring them).
 */
export function construct<T>(Impl: PromiseImpl, executor: TToolboxExecutor<T>, options?: IToolboxOptions): Promise<T> {
	const Ctor = Impl as unknown as new (executor: TToolboxExecutor<T>, options?: ICancelablePromiseOptions) => Promise<T>;

	return new Ctor(executor, options);
}

/**
 * Resolve the promise implementation for a single call. A prebound utility passes its bound default
 * as `boundImpl`; the factory-less prebound canc exports pass `undefined` so the registry (then the
 * built-in CancelablePromise) applies. Precedence: per-call `options.impl`, then the bound default,
 * then the registry, then the built-in.
 */
export function resolveImpl(options?: IToolboxOptions, boundImpl?: PromiseImpl): PromiseImpl {
	return resolvePromiseImpl(options, boundImpl);
}
