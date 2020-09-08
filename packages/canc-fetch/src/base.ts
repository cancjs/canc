// import { AbortController } from 'lib-dom-types';

import { CancelablePromise, CancelError } from '@cancjs/promise';

import { isFunction, isObject } from '../../_util';


type AbortController = any;
type AbortSignal = any;
type fetch = any;
type Event = any;
type Request = any;
type RequestInfo = any;
type RequestInit = any;
declare let AbortController: any;
declare let fetch: any;
declare let Event: any;

const isAbortError = (error: any): boolean => isObject(error) && typeof error.message === 'string' && error.name === 'AbortError';

type TFactoryConfig = {
	fetch?: typeof fetch;
	AbortController?: typeof AbortController;
	Event?: typeof Event;
};

type TPolyfilledAbortSignal = (
	Omit<AbortSignal, 'addEventListener' | 'onabort'> &
	Partial<Pick<AbortSignal, 'addEventListener' | 'onabort'>>
);

export const cancelableFetchFactory = (config: TFactoryConfig = {}) => {
	const _fetch = ('fetch' in config) ? config.fetch! : fetch;
	const _AbortController = ('AbortController' in config) ? config.AbortController! : AbortController;
	const _Event = ('Event' in config) ? config.Event! : Event;

	return function cancelableFetch(input: RequestInfo, init?: RequestInit) {
		return new CancelablePromise((resolve, reject, addOnCancel) => {
			// Request signal can be dummy or originate from a controller
			const originalSignal = (init?.signal || (input as Request)?.signal) as TPolyfilledAbortSignal | null | undefined;
			const controller = new _AbortController();
			const { signal } = controller;

			let isAborted: boolean;
			let isAbortedInternally: boolean;

			const onAbort = function () {
				if (!isAborted) {
					isAborted = true;
					controller.abort();
				}

				if (!isAbortedInternally) {
					isAbortedInternally = true;

					if (originalSignal && isFunction(originalSignal.dispatchEvent)) {
						originalSignal.dispatchEvent(new _Event('abort'));
					}
				}
			};

			if (originalSignal) {
				if ('onabort' in originalSignal) {
					const originalOnAbort = originalSignal.onabort;

					originalSignal.onabort = function (e: Event) {
						isAbortedInternally = true;
						onAbort();

						if (isFunction(originalOnAbort)) {
							originalOnAbort.call(this, e);
						}
					};
				} else if (originalSignal.addEventListener) {
					originalSignal.addEventListener('abort', (_e: Event) => {
						isAbortedInternally = true;
						onAbort();
					});
				}
			}

			addOnCancel(() => onAbort());

			_fetch(input, { ...init, signal })
			.then(
				resolve,
				(reason: any) => {
					if (isAbortError(reason)) {
						reject(new CancelError(reason.message));
					} else {
						reject(reason);
					}
				}
			);
		});
	};
};
