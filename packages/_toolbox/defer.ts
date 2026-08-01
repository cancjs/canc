import { construct, TPromiseCtor } from './construct';
import { IToolboxDeps } from './deps';
import { IPromiseKind, IPromiseLikeKind, TPromiseOf } from './kind';

/**
 * A settleable promise plus its resolve/reject functions, the classic deferred shape and the
 * ancestor of Promise.withResolvers.
 */
export interface IDeferred<T, K extends IPromiseKind = IPromiseLikeKind> {
  promise: TPromiseOf<K, T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

/** Bind `defer` to one promise implementation. */
export function deferFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IToolboxDeps<K>) {
  /**
   * Build a deferred against the bound implementation. Uses its `withResolvers` when present
   * (invoked with the implementation as the receiver, since a cancelable one's withResolvers does
   * `new this(...)`), so per-call options carry through; falls back to a constructor when the
   * implementation lacks it.
   */
  return function defer<T = void>(options?: K['options']): IDeferred<T, K> {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;

    const withResolvers = (
      deps.Impl as unknown as { withResolvers?: (this: TPromiseCtor, options?: object) => IDeferred<any, K> }
    ).withResolvers;

    if (typeof withResolvers === 'function') {
      return withResolvers.call(deps.Impl, options) as IDeferred<T, K>;
    }

    const promise = construct<T, K>(deps.Impl, (res, rej) => {
      resolve = res;
      reject = rej;
    });

    return { promise, resolve, reject };
  };
}
