import { construct, TPromiseCtor, TExecutorCtx } from './construct';

/**
 * Resolve with the value of `promise`, but never before `ms` milliseconds have elapsed. Useful for
 * enforcing a minimum visible duration on a spinner or transition. If `promise` rejects, the
 * rejection propagates immediately without waiting out the delay. When `Impl` is a
 * cancelable-shaped implementation, canceling clears the pending floor timer.
 */
export function minDelay<T>(Impl: TPromiseCtor, promise: T | PromiseLike<T>, ms: number, options?: object): PromiseLike<T> {
	return construct<T>(Impl, (resolve, reject, ctx?: TExecutorCtx) => {
		let elapsed = false;
		let value: T;
		let settled = false;

		const id = setTimeout(() => {
			elapsed = true;
			if (settled) resolve(value);
		}, ms);

		if (ctx) {
			ctx.handleCancel(() => clearTimeout(id));
		}

		Impl.resolve(promise).then(
			(result: T) => {
				value = result;
				settled = true;
				if (elapsed) resolve(value);
			},
			(reason: any) => {
				// Rejections short-circuit the floor: no reason to hold an error back.
				clearTimeout(id);
				reject(reason);
			},
		);
	}, options);
}
