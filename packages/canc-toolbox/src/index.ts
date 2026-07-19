import { CancelablePromise } from '@cancjs/promise';
import * as tb from '../../_toolbox';
import { IToolboxOptions } from './options';

// Prebound canc utilities. Each binds the toolbox algorithm to CancelablePromise, so a bare
// `delay(100)` is cancelable by default and surfaces a CancelablePromise<T> return type callers can
// `.cancel()` without a cast.
export const delay = <T = void>(ms: number, value?: T, options?: IToolboxOptions): CancelablePromise<T> =>
	tb.delay(CancelablePromise as any, ms, value, options) as CancelablePromise<T>;

export const timeout = <T>(promise: T | PromiseLike<T>, ms?: number, options?: IToolboxOptions): CancelablePromise<T> =>
	tb.timeout(CancelablePromise as any, promise, ms, options) as CancelablePromise<T>;

export const waitFor = (condition: () => unknown, options?: tb.IWaitForOptions): CancelablePromise<void> =>
	tb.waitFor(CancelablePromise as any, condition, options) as CancelablePromise<void>;

export const minDelay = <T>(promise: T | PromiseLike<T>, ms: number, options?: IToolboxOptions): CancelablePromise<T> =>
	tb.minDelay(CancelablePromise as any, promise, ms, options) as CancelablePromise<T>;

export const retry = <T>(input: (attempt: number) => T | PromiseLike<T>, options?: tb.IRetryOptions): CancelablePromise<T> =>
	tb.retry(CancelablePromise as any, input, options) as CancelablePromise<T>;

export const promisify = (fn: tb.TCallbackFn, options?: tb.IPromisifyOptions): (...args: any[]) => CancelablePromise<any> =>
	tb.promisify(CancelablePromise as any, fn, options) as (...args: any[]) => CancelablePromise<any>;

export const promisifyAll = <T extends object>(source: T, options?: tb.IPromisifyAllOptions): any =>
	tb.promisifyAll(CancelablePromise as any, source, options);

export { TimeoutError, isTimeoutError } from '../../_toolbox';
export type { IWaitForOptions, IRetryOptions, IPromisifyOptions, IPromisifyAllOptions, TCallbackFn, IDeferred } from '../../_toolbox';

export {
	suppress,
	suppressAbort,
	interopTimeout,
	toAbortSignal,
	withSignal,
	SuppressCategory,
} from './abort-interop';

export { IToolboxOptions, THandleCancel, TToolboxExecutor } from './options';

export { cancelify, ICancelifyOptions, TCancelifyFn } from './signal-thread';

/**
 * A deferred whose promise is a CancelablePromise, so the holder can cancel it directly.
 */
export interface ICancelableDeferred<T> extends tb.IDeferred<T> {
	promise: CancelablePromise<T>;
}

/**
 * A defer whose promise is always a CancelablePromise, so the holder can cancel it directly.
 */
export function deferCancelable<T = void>(options?: IToolboxOptions): ICancelableDeferred<T> {
	return tb.defer<T>(CancelablePromise as any, options) as ICancelableDeferred<T>;
}
