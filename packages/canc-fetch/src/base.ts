import { CancelablePromise, CancelError, createCancelSignal, isCancelSignal } from '@cancjs/promise';

import { isFunction, isObject } from '../../_util';


// Minimal structural stand-ins so the source stays buildable in environments without DOM/Node fetch
// lib types. The real shapes come from whatever globals or config the caller supplies at runtime.
type AbortControllerCtor = new () => { abort: (reason?: any) => void; signal: any };
type Fetch = (input: any, init?: any) => Promise<any>;

declare const fetch: Fetch;
declare const AbortController: AbortControllerCtor;

export interface CancelableFetchConfig {
	fetch?: Fetch;
	// A caller can inject an AbortController implementation. Environments with a faulty or missing
	// AbortController polyfill (some SSR/legacy runtimes) let the caller supply a working one here,
	// which is the whole reason this stays a factory rather than a plain function.
	AbortController?: AbortControllerCtor;
}

// External signals may be polyfilled and lack addEventListener/onabort, so treat those members as
// optional and feature-detect before use.
interface PolyfilledAbortSignal {
	aborted?: boolean;
	reason?: any;
	onabort?: ((this: any, event: any) => any) | null;
	addEventListener?: (type: string, listener: (event: any) => void) => void;
	removeEventListener?: (type: string, listener: (event: any) => void) => void;
}

const isAbortError = (error: any): boolean =>
	isObject(error) && typeof (error as any).message === 'string' && (error as any).name === 'AbortError';

// A missing config key falls back to the ambient global, read at call time (not at factory
// creation) so importing the default entry never touches `fetch`/`AbortController` in an
// environment that lacks them. Callers wanting eager binding pass the globals in explicitly.
const resolve = <T>(config: CancelableFetchConfig, key: keyof CancelableFetchConfig, global: T): T =>
	(key in config ? (config[key] as unknown as T) : global);

// Wiring shared by every product this factory can build (immediate fetch, and the lazy/later
// variants). It owns the whole cancel-signal lifecycle: mint a signal to hand the underlying
// fetch, forward an external caller signal onto it, turn `.cancel()` into a clean CancelError, and
// map an abort rejection back to that CancelError. The caller supplies `handleCancel` (from the
// CancelablePromise executor) and gets back the `signal` to pass into fetch plus a `finalize` to
// call once the request settles.
export interface FetchCancellation {
	signal: any;
	finalize: () => void;
	// Normalizes a fetch rejection: an abort becomes a clean CancelError, anything else passes
	// through untouched.
	toRejection: (reason: any) => any;
}

export const setupCancellation = (
	config: CancelableFetchConfig,
	input: any,
	init: any,
	handleCancel: (onCancel: () => void) => void
): FetchCancellation => {
	const _AbortController = resolve<AbortControllerCtor>(
		config,
		'AbortController',
		typeof AbortController !== 'undefined' ? AbortController : (undefined as any)
	);

	// A signal can come from init or from a Request-object input; either drives external abort.
	const originalSignal = (init?.signal || (input as any)?.signal) as PolyfilledAbortSignal | null | undefined;

	// When the caller injects a custom AbortController, honor it (that injection is the factory's
	// reason to exist). Otherwise reuse createCancelSignal, whose branded signal already aborts with
	// a CancelError, so a spec-compliant fetch rejects with that error verbatim and no mapping is
	// needed.
	const injected = 'AbortController' in config;
	let signal: any;
	let cancel: (reason?: any) => void;

	if (injected) {
		const controller = new _AbortController();
		signal = controller.signal;
		cancel = () => controller.abort();
	} else {
		const cancelSignal = createCancelSignal();
		signal = cancelSignal.signal;
		cancel = cancelSignal.cancel;
	}

	let done = false;

	const abort = (reason?: any) => {
		if (!done) {
			done = true;
			cancel(reason);
		}
	};

	// Detaches whatever we wired onto the caller's long-lived signal, so a signal reused across
	// many fetches does not accumulate listeners. Reassigned when a signal is present.
	let detachSignal = () => {};

	if (originalSignal) {
		if (originalSignal.aborted) {
			// Pre-aborted input: abort our signal immediately, before fetch runs. Forward the reason so
			// a caller cancel signal cancels with its own CancelError verbatim.
			abort(originalSignal.reason);
		} else if (isFunction(originalSignal.addEventListener)) {
			// Native signals (and modern polyfills) expose addEventListener; prefer it. It does not
			// mutate the caller's object, and survives the caller reassigning onabort later.
			const externalAbortListener = () => {
				abort(originalSignal.reason);
			};
			originalSignal.addEventListener('abort', externalAbortListener);

			if (isFunction(originalSignal.removeEventListener)) {
				detachSignal = () => originalSignal.removeEventListener!('abort', externalAbortListener);
			}
		} else if ('onabort' in originalSignal) {
			// Legacy-polyfill fallback: no addEventListener, so chain onabort. Restore the original
			// handler on settle so the signal is left as we found it.
			const originalOnAbort = originalSignal.onabort;

			originalSignal.onabort = function (this: any, event: any) {
				abort(originalSignal.reason);

				if (isFunction(originalOnAbort)) {
					originalOnAbort.call(this, event);
				}
			};

			detachSignal = () => {
				originalSignal.onabort = originalOnAbort ?? null;
			};
		}
	}

	handleCancel(() => abort());

	const toRejection = (reason: any) => {
		if (isCancelSignal(signal) && signal.aborted) {
			// Our own cancel signal already aborts with a CancelError; a spec-compliant fetch rejects
			// with that exact error, so pass it through verbatim.
			return reason;
		}

		if (isAbortError(reason)) {
			return new CancelError(reason.message, { cause: reason });
		}

		return reason;
	};

	return {
		signal,
		finalize: () => detachSignal(),
		toRejection
	};
};

export const cancelableFetchFactory = (config: CancelableFetchConfig = {}) => {
	return function cancelableFetch(input: any, init?: any): CancelablePromise<any> {
		return new CancelablePromise<any>((resolve_, reject, handleCancel) => {
			const _fetch = resolve<Fetch>(config, 'fetch', typeof fetch !== 'undefined' ? fetch : (undefined as any));
			const { signal, finalize, toRejection } = setupCancellation(config, input, init, handleCancel);

			const settle = <T>(callback: (value: T) => void) => (value: T) => {
				finalize();
				callback(value);
			};

			_fetch(input, { ...init, signal }).then(
				settle(resolve_),
				settle((reason: any) => reject(toRejection(reason)))
			);
		});
	};
};
