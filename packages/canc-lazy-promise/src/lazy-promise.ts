import {
	CancelError,
	ICancelablePromiseOptions,
	IPromiseImplOptions,
	PromiseImpl,
	resolvePromiseImpl,
} from '@cancjs/promise';
import { LazyBase, TLazyExecutor, TPromiseCtor } from '../../_lazy';

export type { TLazyExecutor } from '../../_lazy';

export interface ILazyPromiseOptions extends ICancelablePromiseOptions, IPromiseImplOptions {
	/**
	 * When true, if every consumer cancels before the lazy promise settles, its teardown runs and it
	 * returns to the unstarted state, so a later `then`/`await` re-runs the executor from scratch.
	 * Default false: a lazy promise executes at most once and caches its settlement (a canceled lazy
	 * stays canceled).
	 */
	resettable?: boolean;
}

/**
 * A lazily-evaluated, cancelable promise-like. The executor is deferred until the first
 * `then`/`catch`/`finally` (or `await`). Canceling before the first subscription means the executor
 * never runs at all. The result is cached: multiple subscribers share a single execution.
 */
export class CancelableLazyPromise<T = any> extends LazyBase<T> {
	/**
	 * Per-class promise implementation override. Precedence (highest first): a per-call
	 * `options.impl`, this static, the app-wide registry, then the built-in CancelablePromise.
	 */
	static PromiseImpl?: PromiseImpl;

	protected _options?: ILazyPromiseOptions;
	protected _canceledBeforeStart = false;
	protected _cancelError?: CancelError;
	protected _resettable: boolean;
	// Live-consumer tally, only meaningful for a resettable lazy. Each `then` that subscribes before
	// settlement increments it; a per-consumer cancel decrements it. Reaching zero before settlement
	// triggers teardown + reset.
	protected _consumers = 0;

	constructor(executor: TLazyExecutor<T>, options?: ILazyPromiseOptions) {
		super(executor);

		this._options = options;
		this._resettable = !!(options && options.resettable);
	}

	protected _resolveImpl(): TPromiseCtor {
		return resolvePromiseImpl(
			this._options,
			(this.constructor as typeof CancelableLazyPromise).PromiseImpl,
		) as unknown as TPromiseCtor;
	}

	// Cancel-before-start: executor never ran; short-circuit to a rejected settlement so `await`
	// and `.catch` observe the CancelError without ever touching the executor.
	protected _beforeSubscribe(): PromiseLike<T> | undefined {
		if (this._canceledBeforeStart) {
			const Impl = this._resolveImpl() as unknown as PromiseImpl;
			return Impl.reject(this._cancelError) as PromiseLike<T>;
		}

		return undefined;
	}

	protected _afterSubscribe(): void {
		if (this._resettable && this._state === 'RUNNING') {
			this._consumers++;
		}
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

		if (inner && typeof inner.cancel === 'function') {
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
}

/**
 * Create a lazy, cancelable promise from an executor. The executor does not run until the returned
 * value is first subscribed (`then`/`catch`/`finally`/`await`).
 */
export function lazy<T = any>(
	executor: TLazyExecutor<T>,
	options?: ILazyPromiseOptions,
): CancelableLazyPromise<T> {
	return new CancelableLazyPromise<T>(executor, options);
}
