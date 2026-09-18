import { CancelablePromise } from '@cancjs/promise';

import * as tb from '../../_toolbox';
import { deps, ICancelableKind } from './deps';
import { TEagerToolboxOptions } from './options';

/**
 * Prebound canc utilities. Each binds a shared toolbox factory to CancelablePromise, so a bare
 * `delay(100)` is cancelable by default and surfaces a CancelablePromise<T> return type callers can
 * `.cancel()` without a cast. The signatures below are the factories' own: there is no wrapper
 * layer to keep in sync.
 */
export const delay = tb.delayFactory(deps);
export const timeout = tb.timeoutFactory(deps);
export const waitFor = tb.waitForFactory(deps);
/**
 * The floor timer and the input both start on the call, so `lazy` has nothing to defer. The cast is
 * type-only: it drops that option from the signature so passing it fails to compile.
 */
export const minDelay = tb.minDelayFactory(deps) as <T, F = never>(
  input: tb.TTimedInput<T, ICancelableKind, F>,
  ms: tb.TDuration,
  options?: TEagerToolboxOptions,
) => CancelablePromise<T, F>;
/**
 * Fulfill once `signal` aborts. This never rejects; the only rejection is a `CancelError` from an
 * explicit `cancel()` on the returned promise, since aborting is the awaited event, not a failure.
 * Resolves `void`, not the abort reason: the caller already holds `signal` and reads
 * `signal.reason` off it directly.
 *
 * Canceling before the signal aborts removes the listener, which is the whole reason this returns a
 * CancelablePromise instead of a plain one: a `race` against a signal that never fires would
 * otherwise leak the listener for as long as the signal itself lives.
 *
 * This is not how to make an operation cancelable BY a signal. For that, pass `signal` as a
 * constructor option to the operation's own promise, or to `cancelify` / `promisify`.
 *
 * The listener attaches on the call, so `lazy` has nothing to defer. The cast is type-only: it
 * drops that option from the signature so passing it fails to compile.
 */
export const fromAbortSignal = tb.fromAbortSignalFactory(deps) as (
  signal: tb.IAbortSignalLike,
  options?: TEagerToolboxOptions,
) => CancelablePromise<void>;
export const retry = tb.retryFactory(deps);
export const limit = tb.limitFactory(deps);
export const map = tb.mapFactory(deps);
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
