import { construct, TPromiseCtor, THandleCancel } from './construct';

function isObject(value: unknown): value is object {
	return typeof value === 'object' && value !== null;
}

/** A thenable exposing a `cancel` method, the minimal shape needed to stop it on timeout. */
interface ICancelableLike {
	then: PromiseLike<any>['then'];
	cancel: (reason?: any) => void;
}

/**
 * Rejection reason produced when a timeout elapses before the wrapped promise settles.
 */
export class TimeoutError extends Error {
	name: string;

	constructor(message?: string) {
		super(message);

		Object.setPrototypeOf(this, new.target.prototype);
		this.name = 'TimeoutError';
	}
}

if (typeof Symbol !== 'undefined' && Symbol?.toStringTag) {
	(TimeoutError.prototype as any)[Symbol.toStringTag] = 'TimeoutError';
}

export function isTimeoutError(error: unknown): error is TimeoutError {
	const candidate = error as TimeoutError | null | undefined;

	return isObject(candidate) && typeof candidate.message === 'string' && candidate.name === 'TimeoutError';
}

function isCancelable(value: unknown): value is ICancelableLike {
	const candidate = value as ICancelableLike | null | undefined;

	return isObject(candidate) && typeof candidate?.cancel === 'function';
}

/**
 * Reject with a TimeoutError if `promise` has not settled within `ms` milliseconds. When the
 * timeout wins the race, the underlying promise is canceled (if it exposes a `cancel` method) so
 * it stops its own work instead of running detached. The timer is always cleared once the race
 * settles.
 */
export function timeout<T>(Impl: TPromiseCtor, promise: T | PromiseLike<T>, ms = Infinity, options?: object): PromiseLike<T> {
	// The returned promise owns the timer so that canceling it (cancelable flavor) clears the
	// pending timeout and stops the underlying operation, leaving no leaked work. Under a plain
	// native Promise handleCancel is undefined and the timer simply runs to completion.
	return construct<T>(Impl, (resolve, reject, handleCancel?: THandleCancel) => {
		let settled = false;
		const id = setTimeout(() => {
			if (settled) return;
			settled = true;
			// Timeout won: stop the underlying operation so it does not run detached.
			if (isCancelable(promise)) {
				promise.cancel(new TimeoutError());
			}
			reject(new TimeoutError());
		}, ms);

		Impl.resolve(promise).then(
			(value: T) => {
				if (settled) return;
				settled = true;
				clearTimeout(id);
				resolve(value);
			},
			(reason: any) => {
				if (settled) return;
				settled = true;
				clearTimeout(id);
				reject(reason);
			},
		);

		if (typeof handleCancel === 'function') {
			handleCancel(() => {
				settled = true;
				clearTimeout(id);
				if (isCancelable(promise)) {
					promise.cancel();
				}
			});
		}
	}, options);
}
