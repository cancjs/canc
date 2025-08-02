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
 * Build an outbound cancel-signal off a promise node's `handleCancel`. The underlying controller is
 * not constructed until the returned signal is first USED (any property access), so a callback that
 * ignores the signal costs nothing (no controller, no listener). On first use the injected
 * `AbortController` ctor (or the ambient global, read at that moment, never at module load) builds a
 * controller and a single cancel handler is wired to abort it with a branded CancelError. Every
 * access thereafter forwards to the same real signal.
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

	let real: any;

	// Materialize the controller + wiring on first touch, then memoize. Kept off the hot path so a
	// signal-ignoring callback never triggers it.
	const materialize = (): any => {
		if (real) {
			return real;
		}

		const Ctor: AbortControllerCtor = AbortControllerCtor || (AbortController as unknown as AbortControllerCtor);
		const controller = new Ctor();
		real = controller.signal;

		// The core passes the raw cancel reason to this handler; brand it so signal.reason is a
		// CancelError. The core removes this single handler on settle.
		(handleCancel as unknown as (onCancel: (reason?: any) => void) => void)((reason?: any) => {
			controller.abort(toCancelError(reason));
		});

		return real;
	};

	// A Proxy stand-in so the signal can be handed to the callback eagerly (as the (signal, args)
	// contract requires) while the controller is still built lazily: the first property read, write,
	// or has-check forwards to the freshly materialized real signal. A callback that never touches
	// the parameter leaves the controller unbuilt.
	const signal = new Proxy(
		{},
		{
			get(_target, prop) {
				const target = materialize();
				const value = target[prop];
				// Bind methods (e.g. addEventListener) back to the real signal so a platform
				// AbortSignal's illegal-invocation guard is satisfied.
				return typeof value === 'function' ? value.bind(target) : value;
			},
			set(_target, prop, value) {
				materialize()[prop] = value;
				return true;
			},
			has(_target, prop) {
				return prop in materialize();
			},
			getPrototypeOf() {
				return Reflect.getPrototypeOf(materialize());
			},
		},
	);

	return { signal };
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
