import { CancelablePromise, CancelError } from '@cancjs/promise';
import { CancelableLazyPromise, lazy as lazyPromise } from '@cancjs/lazy-promise';

import { CancelableFetchConfig, setupCancellation, FetchCancellation } from './base';
import { isFunction } from '../../_util';


// Minimal structural stand-ins so the source stays buildable in environments without DOM/Node fetch
// lib types. The real shapes come from whatever globals or config the caller supplies at runtime.
type Fetch = (input: any, init?: any) => Promise<any>;

declare const fetch: Fetch;


/**
 * Lazy cancelable fetch: the fetch executor does not run until the returned promise is first
 * subscribed (`.then`/`.catch`/`.await`). Canceling before subscription skips the fetch entirely.
 */
export const lazyFetchFactory = (config: CancelableFetchConfig = {}) => {
	return function lazyFetch(input: any, init?: any): CancelableLazyPromise<any> {
		return lazyPromise<any>(
			(resolve, reject, handleCancel) => {
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
			},
		);
	};
};

/**
 * Default lazy fetch entry: globals (`fetch`, `AbortController`) are captured lazily on first
 * subscription inside the factory, so importing this module is safe even where they are absent.
 */
const lazyFetch = lazyFetchFactory();

export { lazyFetch, lazyFetchFactory };
export type { CancelableFetchConfig };


/**
 * Interop for the `fetchLater()` API (https://developer.mozilla.org/en-US/docs/Web/API/Window/fetchLater),
 * which schedules a fetch for some point in the future. Like lazy fetch, the request is deferred;
 * the two differ in scheduling semantics (fetchLater may fire even after the page unloads).
 *
 * This implementation wraps the native fetchLater (if available) or falls back to a delayed lazy
 * fetch, reusing the shared cancel-signal wiring from the factory. Callers can inject an
 * AbortController (same config as lazy fetch) to work around faulty implementations.
 *
 * Note: on platforms where fetchLater is a true fire-and-forget (e.g. certain browsers), canceling
 * the returned promise after it has settled on the backend will not stop the request. The cancel
 * stops the frontend's ability to observe/react to the result, but the request may have already
 * been sent.
 */
export const fetchLaterFactory = (config: CancelableFetchConfig = {}, delayMs?: number) => {
	return function fetchLater(input: any, init?: any): CancelableLazyPromise<any> {
		// Try to use native fetchLater if available; fall back to a delayed lazy fetch.
		const nativeFetchLater = (typeof globalThis !== 'undefined' && (globalThis as any).fetchLater) as
			| ((input: any, init?: any) => Promise<any>)
			| undefined;

		return lazyPromise<any>(
			(resolve, reject, handleCancel) => {
				const { signal, finalize, toRejection } = setupCancellation(config, input, init, handleCancel);

				const settle = <T>(callback: (value: T) => void) => (value: T) => {
					finalize();
					callback(value);
				};

				// Wrap the actual fetch (native or delayed) in a timeout if delayMs is set.
				const executeRequest = () => {
					const requestPromise = nativeFetchLater
						? nativeFetchLater(input, { ...init, signal })
						: (typeof config.fetch !== 'undefined' ? config.fetch : fetch)(input, { ...init, signal });

					requestPromise.then(
						settle(resolve),
						settle((reason: any) => reject(toRejection(reason)))
					);
				};

				if (delayMs && delayMs > 0) {
					const timeoutHandle = setTimeout(executeRequest, delayMs);
					handleCancel(() => {
						clearTimeout(timeoutHandle);
					});
				} else {
					executeRequest();
				}
			},
		);
	};
};

/**
 * Default fetchLater entry: globals captured lazily on first subscription. No delay by default;
 * callers can wrap in setTimeout or use `fetchLaterFactory(..., delayMs)` for scheduled behavior.
 */
const fetchLater = fetchLaterFactory();

export { fetchLater };
