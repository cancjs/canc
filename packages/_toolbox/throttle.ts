import { debounceFactory, IDebounced, IDebounceDeps } from './debounce';
import { TCallDeps } from './deps';
import { IPromiseKind, IPromiseLikeKind } from './kind';

export type IThrottleOptions = TCallDeps & {
  leading?: boolean;
  trailing?: boolean;
  /** The throttle window always starts immediately, so a `lazy` flag would be accepted and ignored. */
  lazy?: never;
  [key: string]: unknown;
};

export type IThrottled<Args extends unknown[], R, K extends IPromiseKind = IPromiseLikeKind, F = never> = IDebounced<
  Args,
  R,
  K,
  F
>;

export function throttleFactory<K extends IPromiseKind = IPromiseLikeKind>(deps: IDebounceDeps) {
  const debounce = debounceFactory(deps);

  return function throttle<Args extends unknown[], R, F = never>(
    fn: (...args: Args) => R | PromiseLike<R>,
    ms: number,
    options?: IThrottleOptions,
  ): IThrottled<Args, R, K, F> {
    return debounce(fn, ms, {
      ...options,
      leading: options?.leading === false ? false : true,
      trailing: options?.trailing === false ? false : true,
      maxWait: ms,
    });
  };
}
