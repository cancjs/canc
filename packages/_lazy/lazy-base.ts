/**
 * Minimal constructor shape the lazy base builds against: a promise implementation constructible
 * with an executor and an optional options bag. Native Promise ignores the options argument and the
 * executor's third parameter; a cancelable-shaped implementation consumes both. This type is local
 * and erases fully, so this module carries no runtime dependency on any concrete promise package.
 */
export type TPromiseCtor = new (
	executor: (
		resolve: (value?: any) => void,
		reject: (reason?: any) => void,
		ctx?: { handleCancel: (onCancel: (reason?: any) => void) => void; getSignal?: () => any },
	) => void,
	options?: object,
) => PromiseLike<any> & { cancel?: (reason?: any) => any };

/**
 * A cleanup callback registered by the executor, run when the lazy is torn down. Supplied to the
 * executor as its third argument only by a cancelable-shaped implementation; a plain native Promise
 * calls the executor with two arguments.
 */
export type TLazyOnCancel = (reason?: any) => void;

/**
 * Executor for a lazy promise. Runs on the first subscription, never before. Besides the standard
 * `resolve`/`reject`, it receives `handleCancel` to register cleanup, and may also RETURN a
 * teardown function. Both forms register cleanup; a non-function return value is ignored.
 */
export type TLazyExecutor<T> = (
	resolve: (value?: T | PromiseLike<T>) => void,
	reject: (reason?: any) => void,
	handleCancel: (onCancel: TLazyOnCancel) => void,
) => void | TLazyOnCancel;

const isFunction = (value: any): value is Function => typeof value === 'function';

export type TLazyState = 'UNSTARTED' | 'RUNNING' | 'SETTLED';

/**
 * Lazily-evaluated promise-like state machine, free of any cancellation semantics. The executor is
 * deferred until the first `then`/`catch`/`finally` (or `await`), and the result is cached so
 * multiple subscribers share a single execution. Subclasses provide the underlying promise
 * implementation via {@link _resolveImpl} and layer on cancellation (see the cancelable subclass).
 */
export abstract class LazyBase<T = any> implements PromiseLike<T> {
	protected _executor: TLazyExecutor<T>;
	protected _state: TLazyState = 'UNSTARTED';
	protected _inner?: PromiseLike<T> & { cancel?: (reason?: any) => any };
	protected _teardowns: TLazyOnCancel[] = [];

	constructor(executor: TLazyExecutor<T>) {
		if (!isFunction(executor)) {
			throw new TypeError('Argument is not a function');
		}

		this._executor = executor;
	}

	/** Subclass hook: the promise implementation the inner promise is built from. */
	protected abstract _resolveImpl(): TPromiseCtor;

	// Builds and runs the underlying promise once, wiring the executor's handleCancel arg and its
	// optional teardown return into a single teardown list. Idempotent per lifecycle: once RUNNING or
	// SETTLED it returns the cached inner.
	protected _start(): PromiseLike<T> {
		if (this._inner) {
			return this._inner;
		}

		this._state = 'RUNNING';

		const Impl = this._resolveImpl();
		const handleCancel = (onCancel: TLazyOnCancel) => {
			if (isFunction(onCancel)) {
				this._teardowns.push(onCancel);
			}
		};

		// Cancelable-family impls carry the three-arg executor with a ctx object. A plain
		// PromiseConstructor (native twin, injected Promise) ignores the third arg, so teardown wiring
		// falls back to the executor's return value only.
		const inner = new Impl((resolve: (value?: any) => void, reject: (reason?: any) => void, ctx) => {
			const returned = this._executor(
				resolve as (value?: T | PromiseLike<T>) => void,
				reject,
				ctx ? ctx.handleCancel : handleCancel,
			);

			if (isFunction(returned)) {
				this._teardowns.push(returned);
			}
		}) as PromiseLike<T> & { cancel?: (reason?: any) => any };

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
		const shortCircuit = this._beforeSubscribe();

		if (shortCircuit) {
			return shortCircuit.then(onFulfilled, onRejected);
		}

		const inner = this._start();
		this._afterSubscribe();

		return inner.then(onFulfilled, onRejected);
	}

	// Subclass hook run at the top of every `then`, before starting. Returning a PromiseLike
	// short-circuits the subscription entirely (e.g. a cancel-before-start rejection); returning
	// undefined proceeds to `_start`. Base never short-circuits.
	protected _beforeSubscribe(): PromiseLike<T> | undefined {
		return undefined;
	}

	// Subclass hook run after `_start` on a live subscription (e.g. consumer counting). Base no-op.
	protected _afterSubscribe(): void {}

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

	/** True once the executor has been triggered by a subscription. */
	get started(): boolean {
		return this._state !== 'UNSTARTED';
	}
}
