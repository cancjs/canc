import { CancelablePromise } from '@cancjs/promise';

import * as tb from '../../_toolbox';
import { deps, ICancelableKind } from './deps';
import { TEagerToolboxOptions } from './options';

// Prebound canc utilities. Each binds a shared toolbox factory to CancelablePromise, so a bare
// `delay(100)` is cancelable by default and surfaces a CancelablePromise<T> return type callers can
// `.cancel()` without a cast. The signatures below are the factories' own: there is no wrapper
// layer to keep in sync.
export const delay = tb.delayFactory(deps);
export const timeout = tb.timeoutFactory(deps);
export const waitFor = tb.waitForFactory(deps);
/**
 * The floor timer and the input both start on the call, so `lazy` has nothing to defer. The cast is
 * type-only: it drops that option from the signature so passing it fails to compile.
 */
export const minDelay = tb.minDelayFactory(deps) as <T>(
  input: tb.TTimedInput<T>,
  ms: tb.TDuration,
  options?: TEagerToolboxOptions,
) => CancelablePromise<T>;
export const retry = tb.retryFactory(deps);
export const promisify = tb.promisifyFactory(deps);
export const promisifyAll = tb.promisifyAllFactory(deps);

/**
 * A deferred whose promise is a CancelablePromise, so the holder can cancel it directly.
 */
export interface ICancelableDeferred<T> extends tb.IDeferred<T, ICancelableKind> {
  promise: CancelablePromise<T>;
  cancel: (reason?: any) => void | CancelablePromise<PromiseSettledResult<unknown>[]>;
}

/**
 * A defer whose promise is always a CancelablePromise, so the holder can cancel it directly.
 *
 * The narrowing is type-only, with no runtime layer: CancelablePromise.withResolvers hands back a
 * `cancel` alongside the promise, which the shared deferred shape has no way to describe.
 */
export const defer = tb.deferFactory(deps) as <T = void>(options?: TEagerToolboxOptions) => ICancelableDeferred<T>;
