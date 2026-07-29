import { CancelError, CancelablePromise, isCancelError } from '@cancjs/promise';
import { makeCancelSignal, TGetSignal } from '../../_toolbox';
import { IToolboxOptions, THandleCancel } from './options';

/** Structural AbortController, so no dependency on the ambient DOM/Node type in envs that polyfill it. */
type AbortControllerCtor = new () => { abort(reason?: any): void; signal: any };

/**
 * Normalize an arbitrary cancel reason into a branded CancelError, matching cancel() and the core
 * createCancelSignal: a CancelError passes through unwrapped, a string/undefined becomes the message,
 * any other object becomes the cause. This keeps an aborted outbound signal reading as a genuine
 * cancellation end-to-end (spec consumers reject with signal.reason, which is our CancelError).
 * Passed to makeCancelSignal as the reason normalizer so an aborted outbound signal reads branded.
 */
export function toCancelError(reason?: any): CancelError {
	if (isCancelError(reason)) {
		return reason;
	}

	if (reason !== null && typeof reason === 'object') {
		return new CancelError(undefined, { cause: reason });
	}

	return new CancelError(reason);
}

export interface ICancelifyContext {
	getSignal: TGetSignal;
	handleCancel: THandleCancel;
}

export interface ICancelifyOptions extends IToolboxOptions {
	/** AbortController implementation used to mint the outbound signal. Defaults to the ambient global. */
	AbortController?: AbortControllerCtor;
}

/** A promise-returning fn that receives the outbound cancel-signal thunk and the call-args array.
 * Call `getSignal()` only when the underlying API needs a signal; ignoring it allocates nothing. */
export type TCancelifyFn<A extends any[], R> = (ctx: ICancelifyContext, args: A) => R | PromiseLike<R>;

/**
 * Add cancellation to an already-promise-returning fn by handing it an outbound signal that aborts
 * when the returned promise is canceled. The result is always a CancelablePromise; calling
 * `getSignal()` inside fn materializes and wires the controller, while a fn that never calls it
 * constructs nothing.
 */
export function cancelify<A extends any[], R>(
	fn: TCancelifyFn<A, R>,
	options?: ICancelifyOptions,
): (...callArgs: A) => CancelablePromise<R> {
	const Ctor = options?.AbortController;

	return function (...callArgs: A): CancelablePromise<R> {
		const run = (
			resolve: (value: R | PromiseLike<R>) => void,
			reject: (reason?: any) => void,
			handleCancel?: THandleCancel,
		) => {
			// Both construction paths (CancelablePromise) always supply
			// handleCancel to the executor, so it is guaranteed defined here.
			const holder = makeCancelSignal(handleCancel, Ctor, toCancelError);
			CancelablePromise.resolve(fn({ getSignal: holder.getSignal, handleCancel: handleCancel! }, callArgs)).then(
				resolve,
				reject,
			);
		};

		return new CancelablePromise<R>(run, options);
	};
}
