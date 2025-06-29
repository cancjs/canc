import { CANCEL_ERROR_BRAND, CancelError } from './cancel-error';
import { CancelablePromise, ICancelablePromiseOptions, ICancelRef } from './cancelable-promise';
import { isCancelable, isObject, isThenable } from '../../_util';

// Brand check: a foreign error merely named 'CancelError' is NOT matched, only objects carrying
// the shared Symbol.for brand set by the CancelError constructor. Cross-realm/cross-copy safe
// because the brand comes from the global symbol registry.
export const isCancelError = (error: any): error is CancelError => isObject(error) && error[CANCEL_ERROR_BRAND] === true;

export function createCancelRef(): ICancelRef {
	return { cancel: null };
}

export function createAbortSignal() {
	const controller = new AbortController();

	return {
		abort: controller.abort.bind(controller),
		signal: controller.signal
	};
}

export function catchCancel<TResult extends any>(promise: PromiseLike<TResult>): CancelablePromise<TResult | CancelError>;
export function catchCancel<TError extends any>(error: TError): CancelError | never;
export function catchCancel<TResult extends any, TError extends any>(errorOrPromise: PromiseLike<TResult> | TError): CancelablePromise<TResult | CancelError> | CancelError | never {
	// todo: duck-check via isThenable (not `instanceof CancelablePromise`) so foreign
	// thenables, a plain native Promise, a different @cancjs/promise copy (dual-package hazard),
	// another cancelable implementation — are also handled instead of falling through to the
	// error branch (where they'd previously throw synchronously since a promise is never a
	// CancelError). CancelablePromise.resolve(...) wraps/adopts the foreign thenable so .catch()
	// works uniformly regardless of what actually produced it. Any promise can reject with a
	// CancelError (not just ones created via cancel()), so this must be recognized here too.
	if (isThenable(errorOrPromise)) {
		return CancelablePromise.resolve(errorOrPromise as PromiseLike<TResult>)
		.catch((error: any) => {
			if (isCancelError(error)) {
				return error as CancelError;
			} else {
				throw error;
			}
		});
	} else if (isCancelError(errorOrPromise)) {
		return errorOrPromise as CancelError;
	} else {
		throw errorOrPromise;
	}
}

export function suppressCancel<TResult extends any>(promise: PromiseLike<TResult>): CancelablePromise<TResult | void>;
export function suppressCancel<TError extends any>(error: TError): void | never;
export function suppressCancel<TResult extends any, TError extends any>(errorOrPromise: PromiseLike<TResult> | TError): CancelablePromise<TResult | void> | void | never {
	// todo: same isThenable widening as catchCancel above, see that comment. Any thenable
	// (native Promise, foreign cancelable, other @cancjs/promise copy) rejecting with a CancelError
	// gets suppressed, not just CancelablePromise instances.
	if (isThenable(errorOrPromise)) {
		return CancelablePromise.resolve(errorOrPromise as PromiseLike<TResult>)
		.catch((error: any) => {
			if (!isCancelError(error)) {
				throw error;
			}
		});
	} else if (!isCancelError(errorOrPromise)) {
		throw errorOrPromise;
	}
}

export function forceCancelable<T>(promise: PromiseLike<T>, options?: ICancelablePromiseOptions): CancelablePromise<T> {
	return new CancelablePromise(
		(resolve, reject, handleCancel) => {
			promise.then(resolve, reject);

			if (isCancelable(promise)) {
				handleCancel((reason?: any) => {
					promise.cancel(reason);
				});
			}
		},
		options
	);
}
