// Native-Promise entry: every utility is prebound to the platform's Promise, so nothing here is
// cancelable. This is the reduced export set for consumers who only want timing, retry, and
// promisify helpers on plain promises. Use `@cancjs/toolbox` for cancellation support.
import * as tb from '../../_toolbox';
import { IPromisifyAllOptions, IPromisifyOptions, IRetryOptions, IWaitForOptions, TCallbackFn } from '../../_toolbox';

// Captured once at module load per the native-Promise capture invariant; never re-read the
// global afterward.
const NativePromise = Promise;

// Cast through TPromiseCtor (not any): native Promise satisfies the toolbox's minimal
// constructor shape, but TS can't see that across the package boundary without a hint.
const NativePromiseCtor = NativePromise as unknown as tb.TPromiseCtor;

export const delay = <T = void>(ms: number, value?: T, options?: object): Promise<T> =>
  tb.delay(NativePromiseCtor, ms, value, options) as Promise<T>;

export const defer = <T = void>(options?: object) => tb.defer<T>(NativePromiseCtor, options);

// The wrapped promise keeps running after the timeout rejects; a native Promise cannot be
// aborted.
export const timeout = <T>(promise: T | PromiseLike<T>, ms?: number, options?: object): Promise<T> =>
  tb.timeout(NativePromiseCtor, promise, ms, options) as Promise<T>;

export const waitFor = (condition: () => unknown, options?: IWaitForOptions): Promise<void> =>
  tb.waitFor(NativePromiseCtor, condition, options) as Promise<void>;

export const minDelay = <T>(promise: T | PromiseLike<T>, ms: number, options?: object): Promise<T> =>
  tb.minDelay(NativePromiseCtor, promise, ms, options) as Promise<T>;

// No cancel: the retry loop and any pending backoff timer run to completion.
export const retry = <T>(input: (attempt: number) => T | PromiseLike<T>, options?: IRetryOptions): Promise<T> =>
  tb.retry(NativePromiseCtor, input, options) as Promise<T>;

export const promisify = (fn: TCallbackFn, options?: IPromisifyOptions) => tb.promisify(NativePromiseCtor, fn, options);

export const promisifyAll = <T extends object>(source: T, options?: IPromisifyAllOptions): any =>
  tb.promisifyAll(NativePromiseCtor, source, options);

export { isTimeoutError, TimeoutError } from '../../_toolbox';
export type { IDebounced, IDebounceOptions } from '../../_toolbox/debounce';
export type { IThrottled, IThrottleOptions } from '../../_toolbox/throttle';
export { debounce } from './debounce';
export { throttle } from './throttle';
