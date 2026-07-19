import { ICancelablePromiseOptions } from '@cancjs/promise';

/**
 * Options accepted by every toolbox utility. These canc options (bubble, shield, signal, ...) are
 * forwarded to CancelablePromise construction.
 */
export type IToolboxOptions = ICancelablePromiseOptions;

/**
 * A cancel registration callback, supplied to the executor as a third argument by
 * CancelablePromise.
 */
export type THandleCancel = (onCancel: () => void) => void;

/**
 * The executor shape toolbox utilities construct against. It widens the native
 * `(resolve, reject)` signature with the CancelablePromise `handleCancel` argument.
 */
export type TToolboxExecutor<T> = (
	resolve: (value: T | PromiseLike<T>) => void,
	reject: (reason?: any) => void,
	handleCancel?: THandleCancel,
) => void;
