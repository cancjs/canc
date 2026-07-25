import { CancelablePromise } from '@cancjs/promise';
import { cancelify, IToolboxOptions } from '@cancjs/toolbox';

import { isFunction, isObject } from '../../_util';

import { createInterceptorFacade } from './interceptors';
import { CancelScope, SCOPE_KEY } from './scope';
import type { AxiosInstanceLike, CancelableAxiosInstance, ICancelableAxiosOptions } from './types';


export type ICancelableAxiosWrapOptions = ICancelableAxiosOptions & IToolboxOptions;

// Marks an instance this module already wrapped, so wrapping twice is a no-op rather than a second
// layer of signal plumbing.
const BRAND = '__cancelableAxios';

// Aliases taking (url, config).
const URL_METHODS = ['get', 'delete', 'head', 'options'];

// Aliases taking (url, data, config). The *Form and query variants arrived after 0.22 and are
// mirrored only when the underlying axios has them.
const DATA_METHODS = ['post', 'put', 'patch', 'postForm', 'putForm', 'patchForm', 'query'];

// Non-request members mirrored from the source when present. `all` is deliberately absent: it is
// replaced by the cancelable variant below.
const STATIC_MEMBERS = [
	'Axios',
	'AxiosError',
	'AxiosHeaders',
	'Cancel',
	'CancelToken',
	'CanceledError',
	'HttpStatusCode',
	'VERSION',
	'formToJSON',
	'getAdapter',
	'isAxiosError',
	'isCancel',
	'mergeConfig',
	'spread',
	'toFormData',
];

const define = (target: any, name: string, get: () => any, set?: (value: any) => void): void => {
	Object.defineProperty(target, name, {
		configurable: true,
		enumerable: true,
		get: get,
		set: set,
	});
};

/**
 * Wraps an axios instance so its request methods return a CancelablePromise. Canceling aborts the
 * underlying request through an AbortSignal, and rejects with a CancelError whatever the adapter
 * threw.
 *
 * The wrapper holds no axios state of its own: defaults, interceptors and create() all forward to
 * the instance, so config merging, header deep-merge and instance seeding stay axios's own code.
 */
export function wrapAxios(instance: AxiosInstanceLike, options?: ICancelableAxiosWrapOptions): CancelableAxiosInstance {
	if ((isObject(instance) || isFunction(instance)) && (instance as any)[BRAND]) {
		return instance as unknown as CancelableAxiosInstance;
	}

	const ControllerCtor = options?.AbortController;

	// One cancelable wrap for every call shape. The caller supplies how to reach axios, so the
	// aliases go through axios's own methods and keep its config merging and form-header handling.
	const run = cancelify<[(config: any) => Promise<any>, any], any>(function (ctx, args) {
		const call = args[0];
		const config = args[1] || {};
		const scope = new CancelScope(ControllerCtor);

		// A caller-supplied signal aborts the request the same way .cancel() does.
		scope.watch(config.signal);

		if (isFunction(ctx.handleCancel)) {
			(ctx.handleCancel as unknown as (onCancel: (reason?: any) => void) => void)(function (reason?: any) {
				scope.cancel(reason);
			});
		}

		// The scope travels on the config so interceptors and the adapter can reach it. Axios merges
		// configs by walking Object.keys and copies non-plain objects by reference, so a class
		// instance under a plain string key is what survives that merge with its identity intact.
		const requestConfig = { ...config, signal: scope.signal, [SCOPE_KEY]: scope };

		return call(requestConfig).then(
			function (response) {
				scope.finalize();
				return response;
			},
			function (error) {
				scope.finalize();
				throw scope.toRejection(error);
			},
		);
	}, options);

	const wrapped: any = function (configOrUrl: any, maybeConfig?: any) {
		if (typeof configOrUrl === 'string') {
			return wrapped.request({ ...(maybeConfig || {}), url: configOrUrl });
		}

		return wrapped.request(configOrUrl || {});
	};

	wrapped.request = function (config?: any) {
		return run(function (cfg) {
			return instance.request(cfg);
		}, config);
	};

	for (const method of URL_METHODS) {
		if (isFunction((instance as any)[method])) {
			wrapped[method] = function (url: string, config?: any) {
				return run(function (cfg) {
					return (instance as any)[method](url, cfg);
				}, config);
			};
		}
	}

	for (const method of DATA_METHODS) {
		if (isFunction((instance as any)[method])) {
			wrapped[method] = function (url: string, data?: any, config?: any) {
				return run(function (cfg) {
					return (instance as any)[method](url, data, cfg);
				}, config);
			};
		}
	}

	if (isFunction((instance as any).create)) {
		wrapped.create = function (config?: any) {
			return wrapAxios((instance as any).create(config), options);
		};
	}

	if (isFunction((instance as any).getUri)) {
		wrapped.getUri = function (config?: any) {
			return (instance as any).getUri(config);
		};
	}

	// Cancelable counterpart of axios.all: canceling the aggregate cancels every request in it.
	wrapped.all = function (values: any[]) {
		return CancelablePromise.all(values);
	};

	define(
		wrapped,
		'defaults',
		function () {
			return instance.defaults;
		},
		function (value: any) {
			instance.defaults = value;
		},
	);

	const interceptors = {
		request: createInterceptorFacade<any>(instance.interceptors.request),
		response: createInterceptorFacade<any>(instance.interceptors.response),
	};

	define(wrapped, 'interceptors', function () {
		return interceptors;
	});

	for (const name of STATIC_MEMBERS) {
		if (name in (instance as any)) {
			// Read through on every access rather than copying, so a later reassignment on the source
			// is visible here too.
			define(
				wrapped,
				name,
				function () {
					return (instance as any)[name];
				},
				function (value: any) {
					(instance as any)[name] = value;
				},
			);
		}
	}

	Object.defineProperty(wrapped, 'axios', {
		configurable: true,
		enumerable: false,
		value: instance,
	});

	Object.defineProperty(wrapped, BRAND, {
		configurable: true,
		enumerable: false,
		value: true,
	});

	return wrapped as CancelableAxiosInstance;
}
