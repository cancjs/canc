import { CancelablePromise } from '@cancjs/promise';

import * as tb from '../../_toolbox';
import { IToolboxOptions } from './options';

// Prebound canc utilities. Each binds the toolbox algorithm to CancelablePromise, so a bare
// `delay(100)` is cancelable by default and surfaces a CancelablePromise<T> return type callers can
// `.cancel()` without a cast.
// Cast through TPromiseCtor (not any): CancelablePromise satisfies the toolbox's minimal
// constructor shape, but TS can't see that across the package boundary without a hint.
const CancelablePromiseCtor = CancelablePromise as unknown as tb.TPromiseCtor;

export const delay = <T = void>(ms: number, value?: T, options?: IToolboxOptions): CancelablePromise<T> =>
  tb.delay(CancelablePromiseCtor, ms, value, options) as CancelablePromise<T>;

export const timeout = <T>(promise: T | PromiseLike<T>, ms?: number, options?: IToolboxOptions): CancelablePromise<T> =>
  tb.timeout(CancelablePromiseCtor, promise, ms, options) as CancelablePromise<T>;

export const waitFor = (condition: () => unknown, options?: tb.IWaitForOptions): CancelablePromise<void> =>
  tb.waitFor(CancelablePromiseCtor, condition, options) as CancelablePromise<void>;

export const minDelay = <T>(promise: T | PromiseLike<T>, ms: number, options?: IToolboxOptions): CancelablePromise<T> =>
  tb.minDelay(CancelablePromiseCtor, promise, ms, options) as CancelablePromise<T>;

export const retry = <T>(
  input: (attempt: number) => T | PromiseLike<T>,
  options?: tb.IRetryOptions,
): CancelablePromise<T> => tb.retry(CancelablePromiseCtor, input, options) as CancelablePromise<T>;

export const promisify = (
  fn: tb.TCallbackFn,
  options?: tb.IPromisifyOptions,
): ((...args: any[]) => CancelablePromise<any>) =>
  tb.promisify(CancelablePromiseCtor, fn, options) as (...args: any[]) => CancelablePromise<any>;

export const promisifyAll = <T extends object>(source: T, options?: tb.IPromisifyAllOptions): any =>
  tb.promisifyAll(CancelablePromiseCtor, source, options);

/**
 * A deferred whose promise is a CancelablePromise, so the holder can cancel it directly.
 */
export interface ICancelableDeferred<T> extends tb.IDeferred<T> {
  promise: CancelablePromise<T>;
  cancel: (reason?: any) => void | CancelablePromise<PromiseSettledResult<unknown>[]>;
}

/**
 * A defer whose promise is always a CancelablePromise, so the holder can cancel it directly.
 */
export function defer<T = void>(options?: IToolboxOptions): ICancelableDeferred<T> {
  return tb.defer<T>(CancelablePromiseCtor, options) as ICancelableDeferred<T>;
}
