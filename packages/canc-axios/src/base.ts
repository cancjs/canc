import { CancelablePromise } from '@cancjs/promise';
import { cancelify, TEagerToolboxOptions } from '@cancjs/toolbox';

import { isFunction, isObject } from '../../_util';
import { createInterceptorFacade } from './interceptors';
import { CancelScope, SCOPE_KEY } from './scope';
import type { IAxiosInstanceLike, ICancelableAxiosInstance, ICancelableAxiosOptions } from './types';

export type ICancelableAxiosWrapOptions = ICancelableAxiosOptions & TEagerToolboxOptions;

// wrapping a wrapped instance again is a no-op
const BRAND = '__cancelableAxios';

// (url, config) aliases
const URL_METHODS = ['get', 'delete', 'head', 'options'];

// (url, data, config) aliases, *Form and query only after 0.22
const DATA_METHODS = ['post', 'put', 'patch', 'postForm', 'putForm', 'patchForm', 'query'];

// `all` is absent on purpose, the cancelable one below replaces it
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

// only a Node-style stream can be watched and destroyed
const isStreamResponse = (response: any): boolean =>
  isObject(response) &&
  (response as any).config?.responseType === 'stream' &&
  isObject((response as any).data) &&
  isFunction((response as any).data.on) &&
  isFunction((response as any).data.destroy);

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
export function wrapAxios(
  instance: IAxiosInstanceLike,
  options?: ICancelableAxiosWrapOptions,
): ICancelableAxiosInstance {
  if ((isObject(instance) || isFunction(instance)) && (instance as any)[BRAND]) {
    return instance as unknown as ICancelableAxiosInstance;
  }

  const ControllerCtor = options?.AbortController;

  // axios's own methods keep its config merging and form headers
  const run = cancelify(function (ctx, call: (config: any) => Promise<any>, configInput: any) {
    const config = configInput || {};
    const scope = new CancelScope(ControllerCtor);

    // axios would keep only one signal once the wrapper sets its own
    const defaultSignal = instance.defaults?.signal;

    if (defaultSignal !== config.signal) {
      scope.watch(defaultSignal);
    }

    scope.watch(config.signal);

    if (isFunction(ctx.handleCancel)) {
      (ctx.handleCancel as unknown as (onCancel: (reason?: any) => void) => void)(function (reason?: any) {
        scope.cancel(reason);
      });
    }

    // a class instance under a string key survives axios config merging
    const requestConfig = { ...config, signal: scope.signal, [SCOPE_KEY]: scope };

    return new Promise(function (resolve, reject) {
      scope.rejectOnAbort(reject);

      call(requestConfig)
        .then(
          function (response) {
            if (isStreamResponse(response)) {
              scope.holdStream(response.data);
            } else {
              scope.finalize();
            }

            if (scope.aborted) {
              throw scope.reason;
            }

            return response;
          },
          function (error) {
            scope.finalize();
            throw scope.toRejection(error);
          },
        )
        .then(resolve, reject);
    });
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

  // follows the core aggregate cancel rule
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
      // read through, a later reassignment on the source shows here too
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

  return wrapped as ICancelableAxiosInstance;
}
