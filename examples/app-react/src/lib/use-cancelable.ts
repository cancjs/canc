import { type DependencyList, useMemo } from 'react';
import { cancelify } from '@cancjs/toolbox';

import { useCancelableEffect } from './use-cancelable-effect';
import { type PromiseState, usePromiseState } from './use-promise-state';

/**
 * Factory for a cancelable async task. It receives `getSignal`, the same accessor `cancelify`
 * hands out: call it to get an `AbortSignal` that aborts when the run is canceled, and thread it
 * into whatever request the task makes. A factory that never calls `getSignal` still gets
 * chain-level cancellation, it just does not abort an underlying request.
 */
export type CancelableFactory<T> = (getSignal: () => AbortSignal) => Promise<T>;

/**
 * Fetch-on-dependency-change as one hook. Runs `factory` as a `CancelablePromise` and re-runs it
 * whenever `deps` change, canceling the previous run first, and returns its settlement as render
 * state (`{ status, value, error }`). Unmount cancels the last pending run. A canceled run resets
 * to `idle` (a superseded request has no result to show), so a stale response can never overwrite
 * fresher data.
 *
 * This fuses what would otherwise be three hooks (memoize a `cancelify` chain, cancel it on
 * cleanup, track its settlement) into the one call a data fetch actually wants. When you need only
 * the cancel-on-cleanup effect and no render state, reach for `useCancelableEffect` instead; for
 * manual control over settlement tracking, `usePromiseState`.
 */
export function useCancelable<T>(factory: CancelableFactory<T>, deps: DependencyList): PromiseState<T> {
 // A fresh cancelable run per deps change. cancelify supplies the abort signal to the factory.
 const run = useMemo(() => cancelify((getSignal) => factory(getSignal))(), deps);

 // Cancel the superseded (or unmounted) run; the hook suppresses its CancelError.
 useCancelableEffect(() => run, [run]);

 return usePromiseState(run);
}
