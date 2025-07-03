import { CancelablePromise, CancelError } from '@cancjs/promise';

import { isFunction, isObject } from '../../_util';


// Minimal structural stand-ins so the source stays buildable in environments without DOM/Node fetch
// lib types. The real shapes come from whatever globals or config the caller supplies at runtime.
type AbortControllerCtor = new () => { abort: (reason?: any) => void; signal: any };
type EventCtor = new (type: string) => any;
type Fetch = (input: any, init?: any) => Promise<any>;

declare const fetch: Fetch;
declare const AbortController: AbortControllerCtor;
declare const Event: EventCtor;

export interface CancelableFetchConfig {
	fetch?: Fetch;
	AbortController?: AbortControllerCtor;
	Event?: EventCtor;
}

// External signals may be polyfilled and lack addEventListener/onabort/dispatchEvent, so treat
// those members as optional and feature-detect before use.
interface PolyfilledAbortSignal {
	aborted?: boolean;
	onabort?: ((this: any, event: any) => any) | null;
	addEventListener?: (type: string, listener: (event: any) => void) => void;
	dispatchEvent?: (event: any) => boolean;
}

const isAbortError = (error: any): boolean =>
	isObject(error) && typeof (error as any).message === 'string' && (error as any).name === 'AbortError';

// A missing config key falls back to the ambient global, read at call time (not at factory
// creation) so importing the default entry never touches `fetch`/`AbortController`/`Event` in an
// environment that lacks them. Callers wanting eager binding pass the globals in explicitly.
const resolve = <T>(config: CancelableFetchConfig, key: keyof CancelableFetchConfig, global: T): T =>
	(key in config ? (config[key] as unknown as T) : global);

export const cancelableFetchFactory = (config: CancelableFetchConfig = {}) => {
	return function cancelableFetch(input: any, init?: any): CancelablePromise<any> {
		return new CancelablePromise<any>((resolve_, reject, handleCancel) => {
			const _fetch = resolve<Fetch>(config, 'fetch', typeof fetch !== 'undefined' ? fetch : (undefined as any));
			const _AbortController = resolve<AbortControllerCtor>(
				config,
				'AbortController',
				typeof AbortController !== 'undefined' ? AbortController : (undefined as any)
			);
			const _Event = resolve<EventCtor>(config, 'Event', typeof Event !== 'undefined' ? Event : (undefined as any));

			// A signal can come from init or from a Request-object input; either drives external abort.
			const originalSignal = (init?.signal || (input as any)?.signal) as PolyfilledAbortSignal | null | undefined;
			const controller = new _AbortController();
			const { signal } = controller;

			let aborted = false;
			let abortedExternally = false;

			const onAbort = () => {
				if (!aborted) {
					aborted = true;
					controller.abort();
				}

				// Propagate back to a caller-provided signal so its own listeners fire (two-way interop),
				// but only when the abort originated on our side.
				if (!abortedExternally && originalSignal && isFunction(originalSignal.dispatchEvent) && _Event) {
					originalSignal.dispatchEvent(new _Event('abort'));
				}
			};

			if (originalSignal) {
				if (originalSignal.aborted) {
					// Pre-aborted input: abort our controller immediately, before fetch runs.
					abortedExternally = true;
					onAbort();
				} else if ('onabort' in originalSignal) {
					const originalOnAbort = originalSignal.onabort;

					originalSignal.onabort = function (this: any, event: any) {
						abortedExternally = true;
						onAbort();

						if (isFunction(originalOnAbort)) {
							originalOnAbort.call(this, event);
						}
					};
				} else if (isFunction(originalSignal.addEventListener)) {
					originalSignal.addEventListener('abort', () => {
						abortedExternally = true;
						onAbort();
					});
				}
			}

			handleCancel(() => onAbort());

			_fetch(input, { ...init, signal }).then(resolve_, (reason: any) => {
				if (isAbortError(reason)) {
					reject(new CancelError(reason.message, { cause: reason }));
				} else {
					reject(reason);
				}
			});
		});
	};
};
