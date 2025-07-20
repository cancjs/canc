import { PromiseImpl } from '@cancjs/promise';
import { IToolboxOptions, construct, resolveImpl, THandleCancel } from './options';

/**
 * Resolve with the value of `promise`, but never before `ms` milliseconds have elapsed. Useful for
 * enforcing a minimum visible duration on a spinner or transition. If `promise` rejects, the
 * rejection propagates immediately without waiting out the delay. When the resolved implementation
 * is CancelablePromise, canceling clears the pending floor timer.
 */
export function minDelayFactory(boundImpl?: PromiseImpl) {
	return function minDelay<T>(promise: T | PromiseLike<T>, ms: number, options?: IToolboxOptions): Promise<T> {
		const Impl = resolveImpl(options, boundImpl);

		return construct<T>(Impl, (resolve, reject, handleCancel?: THandleCancel) => {
			let elapsed = false;
			let value: T;
			let settled = false;

			const id = setTimeout(() => {
				elapsed = true;
				if (settled) resolve(value);
			}, ms);

			if (typeof handleCancel === 'function') {
				handleCancel(() => clearTimeout(id));
			}

			Impl.resolve(promise).then(
				(result) => {
					value = result;
					settled = true;
					if (elapsed) resolve(value);
				},
				(reason) => {
					// Rejections short-circuit the floor: no reason to hold an error back.
					clearTimeout(id);
					reject(reason);
				},
			);
		}, options);
	};
}

export const minDelay = minDelayFactory();
