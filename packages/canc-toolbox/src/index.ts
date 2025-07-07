import { CancelablePromise } from '@cancjs/promise';
import { deferFactory, IDeferred } from './defer';
import { IToolboxOptions } from './options';

// Prebound canc utilities. Each resolves its implementation through the layered precedence
// (per-call options.impl, then the registered impl, then the built-in CancelablePromise), so a
// bare `delay(100)` is cancelable by default and honors setPromiseImpl.
export { delay, delayFactory } from './delay';
export { defer, deferFactory, IDeferred } from './defer';
export { timeout, timeoutFactory, TimeoutError, isTimeoutError } from './timeout';
export { waitFor, waitForFactory, IWaitForOptions } from './wait-for';
export { minDelay, minDelayFactory } from './min-delay';
export { retry, retryFactory, IRetryOptions } from './retry';

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

/**
 * A defer whose promise is always a CancelablePromise, regardless of the registered implementation.
 * Canc-only: the native twin has no cancelable defer to expose, so this export is excluded there.
 */
export function deferCancelable<T = void>(options?: IToolboxOptions): IDeferred<T> {
	return deferFactory(CancelablePromise as unknown as import('@cancjs/promise').PromiseImpl)({ ...options, impl: undefined });
}
