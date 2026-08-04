// Native-Promise entry: every utility is prebound to the platform's Promise, so nothing here is
// cancelable. This is the reduced export set for consumers who only want timing, retry, and
// promisify helpers on plain promises. Use `@cancjs/toolbox` for cancellation support.
//
// Each export is a shared toolbox factory bound to the captured native Promise, so the signatures
// below are the factories' own: there is no wrapper layer to keep in sync with the cancelable twin.
import * as tb from '../../_toolbox';
import { deps, INativeKind } from './deps';

export const delay = tb.delayFactory(deps);

// `defer` and `minDelay` start their work on the call, so `lazy` has nothing to defer. The casts
// are type-only: they mark that option as unusable so passing it fails to compile.
interface INoLazy {
  lazy?: never;
  [key: string]: unknown;
}

export const defer = tb.deferFactory(deps) as <T = void>(options?: INoLazy) => tb.IDeferred<T, INativeKind>;

// The wrapped promise keeps running after the timeout rejects; a native Promise cannot be
// aborted.
export const timeout = tb.timeoutFactory(deps);

export const waitFor = tb.waitForFactory(deps);

export const minDelay = tb.minDelayFactory(deps) as <T>(
  input: tb.TTimedInput<T>,
  ms: tb.TDuration,
  options?: INoLazy,
) => Promise<T>;

// No cancel: the retry loop and any pending backoff timer run to completion.
export const retry = tb.retryFactory(deps);

export const promisify = tb.promisifyFactory(deps);

export const promisifyAll = tb.promisifyAllFactory(deps);

export type { ILazyWithResolvers, TDuration, TLazyExecutor, TLazyOnCancel, TTimedInput } from '../../_toolbox';
export { isLazyPromise } from '../../_toolbox';
export type { IDebounced, IDebounceOptions } from '../../_toolbox/debounce';
export type { ILazyPromiseOptions } from '../../_toolbox/lazy/lazy-promise-native';
export { createLazyPromise, lazy, LazyPromise } from '../../_toolbox/lazy/lazy-promise-native';
export type { IThrottled, IThrottleOptions } from '../../_toolbox/throttle';
export { debounce } from './debounce';
export type { TErrorConstructor, TErrorMatcher, TErrorPredicate } from './errors';
export {
  AbortError,
  catchAbort,
  catchTimeout,
  createCatchError,
  createSuppressError,
  isAbortError,
  isTimeoutError,
  suppressAbort,
  suppressTimeout,
  TimeoutError,
} from './errors';
export { throttle } from './throttle';
