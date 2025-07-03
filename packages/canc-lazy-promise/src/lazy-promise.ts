import {
	CancelError,
	ICancelablePromiseOptions,
	IPromiseImplOptions,
	PromiseImpl,
	resolvePromiseImpl,
	TOnCancel,
} from '@cancjs/promise';
import { isFunction } from '../../_util';

/**
 * Executor for a lazy promise. Runs on the first subscription, never before. Besides the standard
 * `resolve`/`reject`, it receives `handleCancel` to register cleanup, and may also RETURN a
 * teardown function. Both forms register cleanup that runs when the lazy promise is canceled (or,
 * for a resettable lazy, when its last consumer cancels before it settles). Both may be used
 * together; a non-function return value is ignored.
 */
export type TLazyExecutor<T> = (
	resolve: (value?: T | PromiseLike<T>) => void,
	reject: (reason?: any) => void,
	handleCancel: (onCancel: TOnCancel) => void,
) => void | TOnCancel;

export interface ILazyPromiseOptions extends ICancelablePromiseOptions, IPromiseImplOptions {
	/**
	 * When true, if every consumer cancels before the lazy promise settles, its teardown runs and it
	 * returns to the unstarted state, so a later `then`/`await` re-runs the executor from scratch.
	 * Default false: a lazy promise executes at most once and caches its settlement (a canceled lazy
	 * stays canceled).
	 */
	resettable?: boolean;
}

type TLazyState = 'UNSTARTED' | 'RUNNING' | 'SETTLED';

/**
 * A lazily-evaluated, cancelable promise-like. The executor is deferred until the first
 * `then`/`catch`/`finally` (or `await`). Canceling before the first subscription means the executor
 * never runs at all. The result is cached: multiple subscribers share a single execution.
 */
export class LazyPromise<T = any> implements PromiseLike<T> {
	/**
	 * Per-class promise implementation override. Precedence (highest first): a per-call
	 * `options.impl`, this static, the app-wide registry, then the built-in CancelablePromise.
	 */
	static PromiseImpl?: PromiseImpl;

	protected _executor: TLazyExecutor<T>;
	protected _options?: ILazyPromiseOptions;
	protected _state: TLazyState = 'UNSTARTED';
	protected _inner?: PromiseLike<T> & { cancel?: (reason?: any) => any };
	protected _teardowns: TOnCancel[] = [];
	protected _canceledBeforeStart = false;
	protected _cancelError?: CancelError;
	protected _resettable: boolean;
	// Live-consumer tally, only meaningful for a resettable lazy. Each `then` that subscribes before
	// settlement increments it; a per-consumer cancel decrements it. Reaching zero before settlement
	// triggers teardown + reset.
	protected _consumers = 0;

	constructor(executor: TLazyExecutor<T>, options?: ILazyPromiseOptions) {
		if (!isFunction(executor)) {
			throw new TypeError('Argument is not a function');
		}

		this._executor = executor;
		this._options = options;
		this._resettable = !!(options && options.resettable);
	}

	protected _resolveImpl(): PromiseImpl {
		return resolvePromiseImpl(this._options, (this.constructor as typeof LazyPromise).PromiseImpl);
	}

	// Builds and runs the underlying promise once, wiring the executor's handleCancel arg and its
	// optional teardown return into a single teardown list. Idempotent per lifecycle: once RUNNING or
	// SETTLED it returns the cached inner.
	protected _start(): PromiseLike<T> {
		if (this._inner) {
			return this._inner;
		}

		this._state = 'RUNNING';

		const Impl = this._resolveImpl();
		const handleCancel = (onCancel: TOnCancel) => {
			if (isFunction(onCancel)) {
				this._teardowns.push(onCancel);
			}
		};

		// CancelablePromise-family impls carry the three-arg executor + handleCancel. A plain
		// PromiseConstructor (native twin, injected Promise) ignores the third arg, so teardown wiring
		// falls back to the executor's return value only.
		const inner = new (Impl as unknown as new (
			ex: (
				resolve: (value?: T | PromiseLike<T>) => void,
				reject: (reason?: any) => void,
				handleCancel?: (onCancel: TOnCancel) => void,
			) => void | TOnCancel,
		) => PromiseLike<T> & { cancel?: (reason?: any) => any })((resolve, reject, hc) => {
			// Some impls pass their own handleCancel as the 3rd arg; prefer it so native cancel wiring
			// works, but always also honor an explicit return-fn teardown.
			const returned = this._executor(
				resolve as (value?: T | PromiseLike<T>) => void,
				reject,
				isFunction(hc) ? hc : handleCancel,
			);

			if (isFunction(returned)) {
				this._teardowns.push(returned);
			}
		});

		this._inner = inner;

		const markSettled = () => {
			this._state = 'SETTLED';
		};
		// Cache-settle marker. Await-safe: adopting the inner via then keeps A+ microtask ordering.
		inner.then(markSettled, markSettled);

		return inner;
	}

	protected _runTeardowns(reason?: any): void {
		const teardowns = this._teardowns;
		this._teardowns = [];

		for (const teardown of teardowns) {
			teardown(reason);
		}
	}

	then<TResult1 = T, TResult2 = never>(
		onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
		onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
	): PromiseLike<TResult1 | TResult2> {
		// Cancel-before-start: executor never ran; short-circuit to a rejected settlement so `await`
		// and `.catch` observe the CancelError without ever touching the executor.
		if (this._canceledBeforeStart) {
			const Impl = this._resolveImpl();
			return Impl.reject(this._cancelError).then(onFulfilled, onRejected);
		}

		const inner = this._start();

		if (this._resettable && this._state === 'RUNNING') {
			this._consumers++;
		}

		return inner.then(onFulfilled, onRejected);
	}

	catch<TResult = never>(
		onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null,
	): PromiseLike<T | TResult> {
		return this.then(null, onRejected);
	}

	finally(onFinally?: (() => void) | null): PromiseLike<T> {
		return this.then(
			(value) => {
				if (isFunction(onFinally)) onFinally();
				return value;
			},
			(reason) => {
				if (isFunction(onFinally)) onFinally();
				throw reason;
			},
		);
	}

	/**
	 * Cancel the lazy promise. Before the first subscription this skips the executor entirely (it
	 * never runs). While running it cancels the underlying promise and runs any registered teardown.
	 * On a resettable lazy this is a full per-consumer cancel and, once the last consumer is gone,
	 * resets to the unstarted state.
	 */
	cancel(reason?: any): void {
		if (this._state === 'SETTLED') {
			return;
		}

		if (this._state === 'UNSTARTED') {
			this._canceledBeforeStart = true;
			this._cancelError = reason instanceof CancelError ? reason : new CancelError(reason);
			this._runTeardowns(reason);
			return;
		}

		// RUNNING
		if (this._resettable && this._consumers > 0) {
			this._consumers--;

			if (this._consumers > 0) {
				// Other live consumers still want the result; keep executing.
				return;
			}
		}

		const inner = this._inner;
		this._runTeardowns(reason);

		if (inner && isFunction(inner.cancel)) {
			inner.cancel(reason);
		}

		if (this._resettable) {
			this._reset();
		}
	}

	// Return to UNSTARTED so a later subscription re-runs the executor from scratch (resettable only).
	protected _reset(): void {
		this._state = 'UNSTARTED';
		this._inner = undefined;
		this._teardowns = [];
		this._consumers = 0;
		this._canceledBeforeStart = false;
		this._cancelError = undefined;
	}

	/** True once the executor has been triggered by a subscription. */
	get started(): boolean {
		return this._state !== 'UNSTARTED';
	}
}

/**
 * Native-Promise-backed lazy promise. Same laziness and single-execution caching, but the
 * underlying promise is a plain `Promise`, so there is no downward cancellation of in-flight work;
 * teardown registered via the executor's return value still fires on `cancel`.
 */
export class NativeLazyPromise<T = any> extends LazyPromise<T> {
	static PromiseImpl: PromiseImpl = Promise;
}

/**
 * Create a lazy, cancelable promise from an executor. The executor does not run until the returned
 * value is first subscribed (`then`/`catch`/`finally`/`await`).
 */
export function lazy<T = any>(executor: TLazyExecutor<T>, options?: ILazyPromiseOptions): LazyPromise<T> {
	return new LazyPromise<T>(executor, options);
}

/**
 * Native-Promise-backed twin of {@link lazy}. Cancellation only runs teardown; the underlying
 * `Promise` cannot be aborted mid-flight.
 */
export function nativeLazy<T = any>(
	executor: TLazyExecutor<T>,
	options?: ILazyPromiseOptions,
): NativeLazyPromise<T> {
	return new NativeLazyPromise<T>(executor, options);
}
