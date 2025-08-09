import { onScopeDispose, watch, type WatchSource } from 'vue';
import { type CancelablePromise, isCancelError } from '@cancjs/promise';

/**
 * The watch callback. It receives the new source value and returns the `CancelablePromise` for the
 * async work it starts. Returning the chain is what lets the watch cancel a still-running previous
 * run when the source changes again.
 */
export type CancelableWatchCallback<T> = (value: T) => CancelablePromise<unknown>;

export interface CancelableWatchOptions {
 /** Run the callback immediately with the current source value, like Vue's `{ immediate: true }`. */
 immediate?: boolean;
}

/**
 * An async `watch` where each new trigger cancels the previous callback run that is still pending.
 * This closes the awaited-watch footgun: a plain `watch(source, async () => { await ... })` lets an
 * older, slower run finish and clobber the state of a newer one, because Vue does not wait for or
 * stop the async work. Here the callback returns its `CancelablePromise`, and the next trigger (or
 * scope disposal) calls `cancel()` on the previous one, so only the latest run reaches its effects.
 *
 * A `CancelError` from a superseded run is swallowed. Any other rejection is re-thrown on a
 * microtask so it surfaces as an unhandled rejection rather than being silently dropped.
 */
export function useCancelableWatch<T>(
 source: WatchSource<T>,
 callback: CancelableWatchCallback<T>,
 options: CancelableWatchOptions = {}
): () => void {
 let pending: CancelablePromise<unknown> | undefined;

 const cancelPending = () => {
 pending?.cancel();
 pending = undefined;
 };

 const stopWatch = watch(
 source,
 (value) => {
 // A new trigger supersedes the previous run: cancel it before starting the next one.
 cancelPending();
 const promise = callback(value);
 pending = promise;
 promise.then(
 () => {
 if (pending === promise) pending = undefined;
 },
 (reason) => {
 if (pending === promise) pending = undefined;
 if (!isCancelError(reason)) Promise.reject(reason);
 }
 );
 },
 { immediate: options.immediate }
 );

 const stop = () => {
 stopWatch();
 cancelPending();
 };

 onScopeDispose(stop);
 return stop;
}
