import { isFunction } from '../../_util';
import { getScope } from './scope';
import type { ICancelableAxiosContext, ICancelableInterceptorManager, IInterceptorOptions } from './types';

/** Used when the scope cannot be found, which happens when an interceptor earlier in the chain
 * replaced the config with a fresh object. Cancellation still reaches the request itself through
 * the signal; only the in-interceptor linking is lost. */
const detachedContext: ICancelableAxiosContext = {
  signal: undefined,
  isCanceled: function () {
    return false;
  },
  cancel: function () {},
  link: function (promise) {
    return promise;
  },
};

/** Wraps a user handler so it receives the cancel context, and so a cancelable promise it returns
 * is tied to the request. Axios passes one argument and ignores the return arity, so the extra
 * parameter is invisible to it. */
const wrapHandler = (handler: any): any => {
  if (!isFunction(handler)) {
    return handler;
  }

  return function (value: any) {
    const scope = getScope(value);
    const result = handler(value, scope || detachedContext);

    return scope ? scope.link(result) : result;
  };
};

/** A facade over an axios InterceptorManager. It registers wrapped handlers on the real manager and
 * forwards everything else, so the underlying instance stays the single source of truth: ids stay
 * valid, and interceptors added directly on the axios instance still run. */
export const createInterceptorFacade = <V>(manager: any): ICancelableInterceptorManager<V> => {
  const facade = {
    use: function (onFulfilled?: any, onRejected?: any, options?: IInterceptorOptions): number {
      return manager.use(wrapHandler(onFulfilled), wrapHandler(onRejected), options);
    },
    eject: function (id: number): void {
      manager.eject(id);
    },
    get handlers(): any[] {
      return manager.handlers;
    },
  } as ICancelableInterceptorManager<V>;

  // Added after 0.22, mirrored only when present.
  if (isFunction(manager.clear)) {
    facade.clear = function (): void {
      manager.clear();
    };
  }

  return facade;
};
