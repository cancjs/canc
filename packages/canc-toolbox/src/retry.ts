import { PromiseImpl } from '@cancjs/promise';
import { IToolboxOptions, construct, resolveImpl, THandleCancel } from './options';

export interface IRetryOptions extends IToolboxOptions {
	/** Maximum number of attempts (including the first). Default: 3. */
	retries?: number;
	/** Base backoff in milliseconds between attempts. Default: 0 (retry immediately). */
	minTimeout?: number;
	/** Exponential backoff factor applied per attempt. Default: 2. */
	factor?: number;
	/** Upper bound on any single backoff wait in milliseconds. Default: Infinity. */
	maxTimeout?: number;
	/** Called before each retry with the failing reason and the 1-based attempt number that failed. */
	onRetry?: (reason: any, attempt: number) => void;
}

/**
 * Retry an async operation with exponential backoff. `input` is invoked once per attempt and its
 * rejection triggers a backoff wait before the next attempt, up to `retries` total attempts. The
 * backoff wait is built from the resolved implementation, so when that is CancelablePromise,
 * canceling the returned promise cancels an in-flight backoff wait and stops further attempts
 * immediately; a plain native Promise has no cancellation and simply runs to its retry budget.
 */
export function retryFactory(boundImpl?: PromiseImpl) {
	return function retry<T>(input: (attempt: number) => T | PromiseLike<T>, options?: IRetryOptions): Promise<T> {
		const Impl = resolveImpl(options, boundImpl);
		const retries = options?.retries ?? 3;
		const minTimeout = options?.minTimeout ?? 0;
		const factor = options?.factor ?? 2;
		const maxTimeout = options?.maxTimeout ?? Infinity;

		return construct<T>(Impl, (resolve, reject, handleCancel?: THandleCancel) => {
			let canceled = false;
			let backoffId: ReturnType<typeof setTimeout> | undefined;

			if (typeof handleCancel === 'function') {
				handleCancel(() => {
					canceled = true;
					if (backoffId !== undefined) clearTimeout(backoffId);
				});
			}

			const attempt = (n: number) => {
				if (canceled) return;

				Promise.resolve()
					.then(() => input(n))
					.then(
						(value) => {
							if (!canceled) resolve(value);
						},
						(reason) => {
							if (canceled) return;

							if (n >= retries) {
								reject(reason);
								return;
							}

							options?.onRetry?.(reason, n);

							const wait = Math.min(maxTimeout, minTimeout * Math.pow(factor, n - 1));
							backoffId = setTimeout(() => {
								backoffId = undefined;
								attempt(n + 1);
							}, wait);
						},
					);
			};

			attempt(1);
		}, options);
	};
}

export const retry = retryFactory();
