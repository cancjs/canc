// Native-Promise entry: every utility is prebound to the platform's Promise, so nothing here is
// cancelable. This is the reduced export set for consumers who only want timing, retry, and
// promisify helpers on plain promises. Use `@cancjs/toolbox` for cancellation support.
//
// Each export is a shared toolbox factory bound to the captured native Promise, so the signatures
// below are the factories' own: there is no wrapper layer to keep in sync with the cancelable twin.
import * as tb from '../../_toolbox';
import { deps } from './deps';

export const delay = tb.delayFactory(deps);

export const defer = tb.deferFactory(deps);

// The wrapped promise keeps running after the timeout rejects; a native Promise cannot be
// aborted.
export const timeout = tb.timeoutFactory(deps);

export const waitFor = tb.waitForFactory(deps);

export const minDelay = tb.minDelayFactory(deps);

// No cancel: the retry loop and any pending backoff timer run to completion.
export const retry = tb.retryFactory(deps);

export const promisify = tb.promisifyFactory(deps);

export const promisifyAll = tb.promisifyAllFactory(deps);

export const suppress = tb.suppressFactory(deps);

/**
 * Swallow both AbortError and CancelError-shaped rejections and rethrow everything else.
 * Shorthand for `suppress(promise, { abort: true })`. No cancel-input wiring on this flavor: a
 * native Promise has no `cancel` to propagate to, the same degradation every other native-twin
 * helper in this package already documents.
 */
export function suppressAbort<T>(promise: T | PromiseLike<T>, options?: tb.ISuppressOptions): Promise<T | void> {
  return suppress(promise, { ...options, abort: true });
}

export type {
  ILazyWithResolvers,
  ISuppressOptions,
  TDuration,
  TLazyExecutor,
  TLazyOnCancel,
  TTimedInput,
} from '../../_toolbox';
export { isLazyPromise, isTimeoutError, TimeoutError } from '../../_toolbox';
export type { IDebounced, IDebounceOptions } from '../../_toolbox/debounce';
export type { ILazyPromiseOptions } from '../../_toolbox/lazy/lazy-promise-native';
export { createLazyPromise, lazy, LazyPromise } from '../../_toolbox/lazy/lazy-promise-native';
export type { IThrottled, IThrottleOptions } from '../../_toolbox/throttle';
export { debounce } from './debounce';
export { throttle } from './throttle';
