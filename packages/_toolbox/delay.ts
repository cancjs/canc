import { construct, TPromiseCtor, THandleCancel } from './construct';

/**
 * Resolve after `ms` milliseconds, optionally with a value. When `Impl` is a cancelable-shaped
 * implementation, canceling the returned promise clears the pending timer so no work leaks; a
 * plain native Promise cannot be canceled and the timer runs to completion.
 */
export function delay<T = void>(Impl: TPromiseCtor, ms: number, value?: T, options?: object): PromiseLike<T> {
	return construct<T>(Impl, (resolve, _reject, handleCancel?: THandleCancel) => {
		const id = setTimeout(() => resolve(value as T), ms);

		// handleCancel is supplied only by a cancelable implementation; native Promise leaves it undefined.
		if (typeof handleCancel === 'function') {
			handleCancel(() => clearTimeout(id));
		}
	}, options);
}
