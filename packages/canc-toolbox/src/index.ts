import { CancelablePromise } from '@cancjs/promise';
import { delay as delayImpl } from './delay';
import { deferFactory, IDeferred } from './defer';
import { timeout as timeoutImpl } from './timeout';
import { waitFor as waitForImpl } from './wait-for';
import { minDelay as minDelayImpl } from './min-delay';
import { retry as retryImpl } from './retry';
import { IToolboxOptions } from './options';
import { IWaitForOptions } from './wait-for';
import { IRetryOptions } from './retry';

// Prebound canc utilities. Each resolves its implementation through the layered precedence
// (per-call options.impl, then the registered impl, then the built-in CancelablePromise), so a
// bare `delay(100)` is cancelable by default and honors setPromiseImpl. The factories are generic
// over the implementation and type their result as Promise<T>; these prebound entries default to
// CancelablePromise, so they are surfaced with a CancelablePromise<T> return type and callers can
// `.cancel()` them without a cast.
export const delay: <T = void>(ms: number, value?: T, options?: IToolboxOptions) => CancelablePromise<T> = delayImpl as never;
export const timeout: <T>(promise: T | PromiseLike<T>, ms?: number, options?: IToolboxOptions) => CancelablePromise<T> = timeoutImpl as never;
export const waitFor: (condition: () => unknown, options?: IWaitForOptions) => CancelablePromise<void> = waitForImpl as never;
export const minDelay: <T>(promise: T | PromiseLike<T>, ms: number, options?: IToolboxOptions) => CancelablePromise<T> = minDelayImpl as never;
export const retry: <T>(input: (attempt: number) => T | PromiseLike<T>, options?: IRetryOptions) => CancelablePromise<T> = retryImpl as never;

export { delayFactory } from './delay';
export { deferFactory, IDeferred } from './defer';
export { timeoutFactory, TimeoutError, isTimeoutError } from './timeout';
export { waitForFactory, IWaitForOptions } from './wait-for';
export { minDelayFactory } from './min-delay';
export { retryFactory, IRetryOptions } from './retry';

export {
	suppress,
	suppressFactory,
	suppressAbort,
	suppressAbortFactory,
	interopTimeout,
	interopTimeoutFactory,
	toAbortSignal,
	withSignal,
	SuppressCategory,
} from './abort-interop';

export { IToolboxOptions, THandleCancel, TToolboxExecutor } from './options';

export { cancelify, cancelifyFactory, ICancelifyOptions, TCancelifyFn } from './signal-thread';

export {
	promisify,
	promisifyFactory,
	promisifyAll,
	promisifyAllFactory,
	IPromisifyOptions,
	IPromisifyAllOptions,
	TCallbackFn,
} from './promisify';

/**
 * A deferred whose promise is a CancelablePromise, so the holder can cancel it directly.
 */
export interface ICancelableDeferred<T> extends IDeferred<T> {
	promise: CancelablePromise<T>;
}

/**
 * A defer whose promise is always a CancelablePromise, regardless of the registered implementation.
 * Canc-only: the native twin has no cancelable defer to expose, so this export is excluded there.
 */
export function deferCancelable<T = void>(options?: IToolboxOptions): ICancelableDeferred<T> {
	return deferFactory(CancelablePromise as unknown as import('@cancjs/promise').PromiseImpl)({
		...options,
		impl: undefined,
	}) as ICancelableDeferred<T>;
}
