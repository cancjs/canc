import { PromiseImpl } from '@cancjs/promise';
import { IToolboxOptions, construct, resolveImpl, THandleCancel } from './options';

export interface IWaitForOptions extends IToolboxOptions {
	/** Poll interval in milliseconds. Default: 20. */
	interval?: number;
	/** Reject with a TimeoutError-free Error after this many ms. Default: Infinity (no cap). */
	timeout?: number;
}

/**
 * Resolve once `condition` returns (or resolves to) a truthy value, polling every `interval`
 * milliseconds. When the resolved implementation is CancelablePromise, canceling clears the pending
 * poll timer. The condition may be sync or async; an async condition is awaited before the next
 * poll is scheduled, so slow conditions never overlap.
 */
export function waitForFactory(boundImpl?: PromiseImpl) {
	return function waitFor(condition: () => unknown, options?: IWaitForOptions): Promise<void> {
		const Impl = resolveImpl(options, boundImpl);
		const interval = options?.interval ?? 20;
		const limit = options?.timeout ?? Infinity;

		return construct<void>(Impl, (resolve, reject, handleCancel?: THandleCancel) => {
			let timerId: ReturnType<typeof setTimeout> | undefined;
			let deadlineId: ReturnType<typeof setTimeout> | undefined;
			let settled = false;

			const clearTimers = () => {
				if (timerId !== undefined) clearTimeout(timerId);
				if (deadlineId !== undefined) clearTimeout(deadlineId);
			};

			const finish = (fn: () => void) => {
				if (settled) return;
				settled = true;
				clearTimers();
				fn();
			};

			const poll = () => {
				if (settled) return;

				let result: unknown;
				try {
					result = condition();
				} catch (error) {
					finish(() => reject(error));
					return;
				}

				Promise.resolve(result).then(
					(value) => {
						if (value) {
							finish(() => resolve());
						} else if (!settled) {
							timerId = setTimeout(poll, interval);
						}
					},
					(error) => finish(() => reject(error)),
				);
			};

			if (limit !== Infinity) {
				deadlineId = setTimeout(() => finish(() => reject(new Error('waitFor timed out'))), limit);
			}

			if (typeof handleCancel === 'function') {
				handleCancel(() => {
					settled = true;
					clearTimers();
				});
			}

			poll();
		}, options);
	};
}

export const waitFor = waitForFactory();
