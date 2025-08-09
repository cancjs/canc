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

/**
 * Build an outbound cancel-signal off a promise node's `handleCancel`. A single controller is
 * constructed via the injected `AbortController` ctor (or the ambient global, read at call time,
 * never at module load), and one cancel handler is wired to abort it with a branded CancelError, so
 * an aborted signal reads as a genuine cancellation. The real `signal` is returned directly, so the
 * value handed to the callback is a plain AbortSignal (no Proxy — keeps the helper usable on ES5 /
 * low-end engines where Proxy cannot be polyfilled).
 *
 * When `handleCancel` is undefined (a native, non-cancelable implementation) `signal` is `undefined`,
 * so callbacks can detect the no-cancel case with `signal === undefined`. Cleanup needs nothing here:
 * the core removes the single registered handler when the promise settles.
 */
export function makeCancelSignal(
	handleCancel: THandleCancel | undefined,
	AbortControllerCtor?: AbortControllerCtor,
): { readonly signal: any } {
	// Native / no-cancel path: no signal to hand out, and nothing to wire.
	if (typeof handleCancel !== 'function') {
		return { signal: undefined };
	}

	const Ctor: AbortControllerCtor = AbortControllerCtor || (AbortController as unknown as AbortControllerCtor);
	const controller = new Ctor();

	// The core passes the raw cancel reason to this handler; brand it so signal.reason is a
	// CancelError. The core removes this single handler on settle.
	(handleCancel as unknown as (onCancel: (reason?: any) => void) => void)((reason?: any) => {
		controller.abort(toCancelError(reason));
	});

	return { signal: controller.signal };
}

export interface ICancelifyOptions extends IToolboxOptions {
	/** Return a LazyPromise: the underlying fn is deferred until the first await. Default false. */
	lazy?: boolean;
	/** AbortController implementation used to mint the outbound signal. Defaults to the ambient global. */
	AbortController?: AbortControllerCtor;
}

/** A promise-returning fn that receives the outbound cancel-signal and the call-args array. */
export type TCancelifyFn<A extends any[], R> = (signal: any, args: A) => R | PromiseLike<R>;

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
				// Reading holder.signal inside fn materializes and wires the controller; a fn that
				// ignores it never constructs one.
				Impl.resolve(fn(holder.signal, callArgs)).then(resolve, reject);
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
