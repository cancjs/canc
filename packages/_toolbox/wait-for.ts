import { construct, TPromiseCtor, TExecutorCtx } from './construct';

export interface IWaitForOptions {
	/** Poll interval in milliseconds. Default: 20. */
	interval?: number;
	/** Reject with a plain Error after this many ms. Default: Infinity (no cap). */
	timeout?: number;
	[key: string]: unknown;
}

/**
 * Resolve once `condition` returns (or resolves to) a truthy value, polling every `interval`
 * milliseconds. When `Impl` is a cancelable-shaped implementation, canceling clears the pending
 * poll timer. The condition may be sync or async; an async condition is awaited before the next
 * poll is scheduled, so slow conditions never overlap.
 */
export function waitFor(Impl: TPromiseCtor, condition: () => unknown, options?: IWaitForOptions): PromiseLike<void> {
	const interval = options?.interval ?? 20;
	const limit = options?.timeout ?? Infinity;

	return construct<void>(Impl, (resolve, reject, ctx?: TExecutorCtx) => {
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

			Impl.resolve(result).then(
				(value: unknown) => {
					if (value) {
						finish(() => resolve());
					} else if (!settled) {
						timerId = setTimeout(poll, interval);
					}
				},
				(error: any) => finish(() => reject(error)),
			);
		};

		if (limit !== Infinity) {
			deadlineId = setTimeout(() => finish(() => reject(new Error('waitFor timed out'))), limit);
		}

		if (ctx) {
			ctx.handleCancel(() => {
				settled = true;
				clearTimers();
			});
		}

		poll();
	}, options);
}
