import { debounceFactory, IDebounced, IDebounceDeps } from './debounce';

export interface IThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
  /** The throttle window always starts immediately, so a `lazy` flag would be accepted and ignored. */
  lazy?: never;
  [key: string]: unknown;
}

export type IThrottled<Args extends unknown[], R> = IDebounced<Args, R>;

export function throttleFactory(deps: IDebounceDeps) {
  const debounce = debounceFactory(deps);

  return function throttle<Args extends unknown[], R>(
    fn: (...args: Args) => R | PromiseLike<R>,
    ms: number,
    options?: IThrottleOptions,
  ): IThrottled<Args, R> {
    return debounce(fn, ms, {
      leading: options?.leading === false ? false : true,
      trailing: options?.trailing === false ? false : true,
      maxWait: ms,
    });
  };
}
