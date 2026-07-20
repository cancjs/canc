import { CancelableLazyPromise, lazy as lazyPromise, TLazyExecutor } from '@cancjs/lazy-promise';

import {
	CancelableFetchConfig,
	CancelableFetchLaterConfig,
	DeferredRequestInit,
	FetchLaterResultLike,
	setupCancellation,
	runFetchLater,
	attachActivated,
} from './base';


// Minimal structural stand-in so the source stays buildable in environments without DOM/Node fetch
// lib types. The real shape comes from whatever globals or config the caller supplies at runtime.
type Fetch = (input: any, init?: any) => Promise<any>;

declare const fetch: Fetch;


/**
 * Lazy cancelable fetch: the fetch executor does not run until the returned promise is first
 * subscribed (`.then`/`.catch`/`await`). Canceling before subscription skips the fetch entirely.
 */
const cancelableLazyFetchFactory = (config: CancelableFetchConfig = {}) => {
	return function cancelableLazyFetch(input: any, init?: any): CancelableLazyPromise<any> {
		return lazyPromise<any>(
			((resolve: (value: any) => void, reject: (reason: any) => void, handleCancel: (onCancel: () => void) => void) => {
				const _fetch = (typeof config.fetch !== 'undefined' ? config.fetch : fetch) as Fetch;
				const { signal, finalize, toRejection } = setupCancellation(config, input, init, handleCancel);

				const settle = <T>(callback: (value: T) => void) => (value: T) => {
					finalize();
					callback(value);
				};

				_fetch(input, { ...init, signal }).then(
					settle(resolve),
					settle((reason: any) => reject(toRejection(reason)))
				);
			}) as TLazyExecutor<any>,
		);
	};
};

const cancelableLazyFetch = cancelableLazyFetchFactory();


/**
 * Lazy interop for the fetchLater() API. Unlike the immediate variant, the underlying `fetchLater()`
 * call is itself deferred until the returned promise is first subscribed (`.then`/`.catch`/`await`).
 * Before it starts, nothing is registered, no quota is reserved, and `.activated` reads as null.
 * Canceling before the first subscription never calls `fetchLater()`. After it starts, settlement
 * follows the same rules as the immediate variant: with `activateAfter` set the FetchLaterResult
 * `activated` flag is polled and the promise resolves once it flips true; without it the promise
 * stays pending until cancel (awaiting it hangs, by design).
 */
const cancelableLazyFetchLaterFactory = (config: CancelableFetchLaterConfig = {}) => {
	return function cancelableLazyFetchLater(input: any, init?: DeferredRequestInit): CancelableLazyPromise<FetchLaterResultLike> {
		let result: FetchLaterResultLike | null = null;

		const promise = lazyPromise<FetchLaterResultLike>(
			((resolve: (value: FetchLaterResultLike) => void, reject: (reason: any) => void, handleCancel: (onCancel: () => void) => void) => {
				runFetchLater(config, input, init, resolve, reject, handleCancel, (r) => {
					result = r;
				});
			}) as TLazyExecutor<FetchLaterResultLike>,
		);

		attachActivated(promise as any, () => result);

		return promise;
	};
};

const cancelableLazyFetchLater = cancelableLazyFetchLaterFactory();


export {
	cancelableLazyFetch,
	cancelableLazyFetchFactory,
	cancelableLazyFetchLater,
	cancelableLazyFetchLaterFactory,
};
export type { CancelableFetchConfig, CancelableFetchLaterConfig };
