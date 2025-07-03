import { PromiseImpl } from '@cancjs/promise';
import { IToolboxOptions, construct, resolveImpl, THandleCancel } from './options';

/**
 * Resolve after `ms` milliseconds, optionally with a value. When the resolved implementation is
 * CancelablePromise, canceling the returned promise clears the pending timer so no work leaks; a
 * plain native Promise cannot be canceled and the timer runs to completion.
 */
export function delayFactory(boundImpl?: PromiseImpl) {
	return function delay<T = void>(ms: number, value?: T, options?: IToolboxOptions): Promise<T> {
		const Impl = resolveImpl(options, boundImpl);

		return construct<T>(Impl, (resolve, _reject, handleCancel?: THandleCancel) => {
			const id = setTimeout(() => resolve(value as T), ms);

			// handleCancel is supplied only by CancelablePromise; native Promise leaves it undefined.
			if (typeof handleCancel === 'function') {
				handleCancel(() => clearTimeout(id));
			}
		}, options);
	};
}

export const delay = delayFactory();
