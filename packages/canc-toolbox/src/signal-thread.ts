import { CancelError, CancelablePromise, PromiseImpl, isCancelError } from '@cancjs/promise';
import { lazy, nativeLazy } from '@cancjs/lazy-promise';
import { IToolboxOptions, THandleCancel, construct, resolveImpl } from './options';

/** Structural AbortController, so no dependency on the ambient DOM/Node type in envs that polyfill it. */
type AbortControllerCtor = new () => { abort(reason?: any): void; signal: any };

/**
 * Normalize an arbitrary cancel reason into a branded CancelError, matching cancel() and the core
 * createAbortSignal: a CancelError passes through unwrapped, a string/undefined becomes the message,
 * any other object becomes the cause. This keeps an aborted outbound signal reading as a genuine
 * cancellation end-to-end (spec consumers reject with signal.reason, which is our CancelError).
 */
function toCancelError(reason?: any): CancelError {
	if (isCancelError(reason)) {
		return reason;
	}

	if (reason !== null && typeof reason === 'object') {
		return new CancelError(undefined, { cause: reason });
	}

	return new CancelError(reason);
}

/** Lazily materialized outbound cancel-signal. Calling `getSignal()` returns the AbortSignal (or
 * `undefined` on a native, non-cancelable implementation). */
export type TGetSignal = () => any;

/**
 * Build a lazy outbound cancel-signal off a promise node's `handleCancel`. The returned `getSignal`
 * thunk constructs the controller only on its FIRST call (via the injected `AbortController` ctor,
 * or the ambient global read at that moment, never at module load) and wires one cancel handler that
 * aborts it with a branded CancelError, so an aborted signal reads as a genuine cancellation. A
 * callback that never calls `getSignal()` costs nothing: no controller, no listener. Subsequent calls
 * return the same signal. A plain closure, no Proxy, so the helper stays usable on ES5 / low-end
 * engines where Proxy cannot be polyfilled.
 *
 * When `handleCancel` is undefined (a native, non-cancelable implementation) `getSignal()` returns
 * `undefined`, so callbacks can detect the no-cancel case. Cleanup needs nothing here: the core
 * removes the single registered handler when the promise settles.
 */
export function makeCancelSignal(
	handleCancel: THandleCancel | undefined,
	AbortControllerCtor?: AbortControllerCtor,
): { getSignal: TGetSignal } {
	// Native / no-cancel path: no signal to hand out, and nothing to wire.
	if (typeof handleCancel !== 'function') {
		return { getSignal: () => undefined };
	}

	let signal: any;
	let built = false;

	return {
		getSignal() {
			if (!built) {
				built = true;
				const Ctor: AbortControllerCtor = AbortControllerCtor || (AbortController as unknown as AbortControllerCtor);
				const controller = new Ctor();
				signal = controller.signal;

				// The core passes the raw cancel reason to this handler; brand it so signal.reason is a
				// CancelError. The core removes this single handler on settle.
				(handleCancel as unknown as (onCancel: (reason?: any) => void) => void)((reason?: any) => {
					controller.abort(toCancelError(reason));
				});
			}

			return signal;
		},
	};
}

export interface ICancelifyOptions extends IToolboxOptions {
	/** Return a LazyPromise: the underlying fn is deferred until the first await. Default false. */
	lazy?: boolean;
	/** AbortController implementation used to mint the outbound signal. Defaults to the ambient global. */
	AbortController?: AbortControllerCtor;
}

/** A promise-returning fn that receives the outbound cancel-signal thunk and the call-args array.
 * Call `getSignal()` only when the underlying API needs a signal; ignoring it allocates nothing. */
export type TCancelifyFn<A extends any[], R> = (getSignal: TGetSignal, args: A) => R | PromiseLike<R>;

/**
 * Add cancellation to an already-promise-returning fn by handing it an outbound signal that aborts
 * when the returned promise is canceled. `boundImpl` fixes the promise implementation (the native
 * twin binds Promise); an unbound factory resolves the implementation per call through the registry.
 */
export function cancelifyFactory(boundImpl?: PromiseImpl) {
	return function cancelify<A extends any[], R>(
		fn: TCancelifyFn<A, R>,
		options?: ICancelifyOptions,
	): (...callArgs: A) => CancelablePromise<R> {
		const Impl = resolveImpl(options, boundImpl);
		const Ctor = options?.AbortController;

		return function (...callArgs: A): CancelablePromise<R> {
			const run = (
				resolve: (value: R | PromiseLike<R>) => void,
				reject: (reason?: any) => void,
				handleCancel?: THandleCancel,
			) => {
				const holder = makeCancelSignal(handleCancel, Ctor);
				// Calling getSignal() inside fn materializes and wires the controller; a fn that never
				// calls it constructs nothing.
				Impl.resolve(fn(holder.getSignal, callArgs)).then(resolve, reject);
			};

			if (options?.lazy) {
				const makeLazy = Impl === (Promise as unknown as PromiseImpl) ? nativeLazy : lazy;

				return makeLazy(run, options) as unknown as CancelablePromise<R>;
			}

			return construct<R>(Impl, run, options) as CancelablePromise<R>;
		};
	};
}

export const cancelify = cancelifyFactory();
