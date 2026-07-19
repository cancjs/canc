import { CancelablePromise, ICancelable, isAbortError, isCancelError } from '@cancjs/promise';
import { IToolboxOptions, THandleCancel } from './options';

/**
 * The reason categories a suppress filter recognizes. `'cancel'` matches a canc CancelError (any
 * cancellation, abort-driven or not); `'abort'` matches an AbortSignal abort, whether it surfaced as
 * a raw DOMException AbortError or as a CancelError carrying that abort as its cause.
 */
export type SuppressCategory = 'abort' | 'cancel';

// AbortSignal.any (ES2024 / Node 20.3+) exists at runtime in every supported target but is not
// declared by the ambient AbortSignal typing this workspace resolves. Reference it through a narrow
// typed view instead of augmenting the platform type.
const abortSignalAny = (AbortSignal as unknown as { any(signals: AbortSignal[]): AbortSignal }).any;

// withSignal has no toolbox options and always returns a plain native promise, so there is no
// resolved Impl to route through; capture the native constructor once at module load instead of
// reading the live global on every call.
const NativePromise = Promise;

function isObject(value: unknown): value is object {
	return typeof value === 'object' && value !== null;
}

/**
 * Whether `reason` falls into a requested category. `'abort'` is satisfied both by a bare AbortError
 * and by a CancelError whose `aborted` getter is true (abort threaded through cancellation).
 */
function matchesCategory(reason: unknown, categories: readonly SuppressCategory[]): boolean {
	const wantAbort = categories.includes('abort');
	const wantCancel = categories.includes('cancel');

	if (wantAbort && (isAbortError(reason) || (isCancelError(reason) && (reason as { aborted?: boolean }).aborted === true))) {
		return true;
	}

	if (wantCancel && isCancelError(reason)) {
		return true;
	}

	return false;
}

/**
 * Swallow rejections of `promise` whose reason matches one of `categories`, rethrowing anything
 * else. Resolves to the fulfilled value or `undefined` when a matched rejection was suppressed. The
 * returned promise is built through the resolved implementation, so it is cancelable by default.
 */
export function suppress<T>(
	categories: readonly SuppressCategory[],
	promise: T | PromiseLike<T>,
	options?: IToolboxOptions,
): Promise<T | void> {
	return new CancelablePromise<T | void>((resolve, reject, handleCancel?: THandleCancel) => {
		CancelablePromise.resolve(promise).then(
			(value) => resolve(value),
			(reason) => {
				if (matchesCategory(reason, categories)) {
					resolve(undefined);
				} else {
					reject(reason);
				}
			},
		);

		if (typeof handleCancel === 'function') {
			handleCancel(() => {
				if (isCancelable(promise)) {
					(promise as ICancelable).cancel();
				}
			});
		}
	}, options);
}

/**
 * Swallow AbortError rejections (bare or wrapped in a CancelError) and rethrow everything else.
 * Shorthand for `suppress(['abort'], promise)`.
 */
export function suppressAbort<T>(promise: T | PromiseLike<T>, options?: IToolboxOptions): Promise<T | void> {
	return suppress(['abort'], promise, options);
}

function isCancelable(value: unknown): value is ICancelable {
	return isObject(value) && typeof (value as { cancel?: unknown }).cancel === 'function';
}

/**
 * Reject with the external signal's abort reason if it aborts first, otherwise reject with an
 * AbortError once `ms` elapses, otherwise adopt the underlying promise's settlement. Combines an
 * externally supplied `signal` (fetch-style cancellation) with a timeout in one race and composes
 * them via AbortSignal.any so a single abort listener drives cancellation. The underlying promise is
 * canceled (if cancelable) when either the signal or the timeout wins, leaving no detached work.
 */
export function interopTimeout<T>(
	promise: T | PromiseLike<T>,
	ms: number,
	signal?: AbortSignal,
	options?: IToolboxOptions,
): Promise<T> {
	return new CancelablePromise<T>((resolve, reject, handleCancel?: THandleCancel) => {
		const timeoutSignal = AbortSignal.timeout(ms);
		// Compose the external signal (if any) with the timeout so one listener covers both. When
		// no external signal is supplied, race against the timeout alone.
		const combined = signal ? abortSignalAny([signal, timeoutSignal]) : timeoutSignal;

		let settled = false;

		const onAbort = () => {
			if (settled) return;
			settled = true;
			if (isCancelable(promise)) {
				(promise as ICancelable).cancel(combined.reason);
			}
			reject(combined.reason);
		};

		if (combined.aborted) {
			onAbort();
			return;
		}

		combined.addEventListener('abort', onAbort, { once: true });

		CancelablePromise.resolve(promise).then(
			(value) => {
				if (settled) return;
				settled = true;
				combined.removeEventListener('abort', onAbort);
				resolve(value);
			},
			(reason) => {
				if (settled) return;
				settled = true;
				combined.removeEventListener('abort', onAbort);
				reject(reason);
			},
		);

		if (typeof handleCancel === 'function') {
			handleCancel(() => {
				settled = true;
				combined.removeEventListener('abort', onAbort);
				if (isCancelable(promise)) {
					(promise as ICancelable).cancel();
				}
			});
		}
	}, options);
}

/**
 * Inverse interop: derive an AbortSignal that fires when `promise` cancels (or otherwise rejects).
 * Lets a cancelable operation drive a downstream API that only speaks AbortSignal (fetch, an
 * AbortSignal.any composition, etc). A fulfilled promise never aborts the signal. The returned
 * controller's own `abort()` is also honored, so callers may compose or force-abort it.
 */
export function toAbortSignal(promise: PromiseLike<unknown>): AbortSignal {
	const controller = new AbortController();

	promise.then(
		() => {
			// Fulfilled: nothing to abort.
		},
		(reason) => {
			if (!controller.signal.aborted) {
				controller.abort(reason);
			}
		},
	);

	return controller.signal;
}

/**
 * p-signal-shaped: race `promiseOrFn` against `signal` aborting. A function input receives the
 * signal so it can wire native cancellation, then its result is raced. When `signal` is `undefined`
 * the value passes through unraced (optional-cancellation signatures: callers thread an optional
 * signal without branching). Aborting rejects with the signal's abort reason (a DOMException
 * AbortError); an already-aborted signal rejects immediately.
 */
export function withSignal<T>(signal: AbortSignal | undefined, promiseOrFn: ((signal?: AbortSignal) => T | PromiseLike<T>) | T | PromiseLike<T>): Promise<T> {
	const source: T | PromiseLike<T> = typeof promiseOrFn === 'function'
		? (promiseOrFn as (signal?: AbortSignal) => T | PromiseLike<T>)(signal)
		: promiseOrFn;

	// No signal: pass the value straight through so optional-cancellation call sites need no branch.
	if (signal === undefined) {
		return NativePromise.resolve(source);
	}

	return new NativePromise<T>((resolve, reject) => {
		// A signal's abort reason is a DOMException AbortError (an Error) at runtime.
		const abortReason = () => signal.reason as Error;

		if (signal.aborted) {
			reject(abortReason());
			return;
		}

		const onAbort = () => reject(abortReason());
		signal.addEventListener('abort', onAbort, { once: true });

		NativePromise.resolve(source).then(
			(value) => {
				signal.removeEventListener('abort', onAbort);
				resolve(value);
			},
			(reason: unknown) => {
				signal.removeEventListener('abort', onAbort);
				// Re-propagate the source's own rejection reason unchanged.
				reject(reason as Error);
			},
		);
	});
}

