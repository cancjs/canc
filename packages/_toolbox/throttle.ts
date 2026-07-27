import { debounceFactory, IDebounceDeps, IDebounced } from './debounce';

export interface IThrottleOptions {
	leading?: boolean;
	trailing?: boolean;
	[key: string]: unknown;
}

export type IThrottled<Args extends unknown[], R> = IDebounced<Args, R>;

export function throttleFactory(deps: IDebounceDeps) {
	var debounce = debounceFactory(deps);

	return function throttle<Args extends unknown[], R>(
		fn: (...args: Args) => R | PromiseLike<R>,
		ms: number,
		options?: IThrottleOptions,
	): IThrottled<Args, R> {
		return debounce(fn, ms, {
			leading: options != null && options.leading === false ? false : true,
			trailing: options != null && options.trailing === false ? false : true,
			maxWait: ms,
		});
	};
}
