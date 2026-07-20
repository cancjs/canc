import { CancelError } from './cancel-error';
import {
	catchCancel,
	createCancelSignal,
	makeCancelable,
	isCancelError,
	isCancelSignal,
	suppressCancel
} from './helpers';
import { CancelablePromise, ICancelable } from './cancelable-promise';

function flushPromises(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}

// Plain Error subclass, prototype reset needed for the same es5-target reason CancelError resets
// it (see cancel-error.ts): `class extends Error` alone loses instanceof under es5 transpilation.
class AbortError extends Error {
	override readonly name = 'AbortError';

	constructor(message?: string) {
		super(message);
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

describe('isCancelError', () => {
	it('strictly detects cancel error', () => {
		expect(isCancelError(new CancelError())).toBe(true);
	});

	// Detection is brand-based, not name-based. A foreign object merely named 'CancelError' is
	// NOT a canc CancelError and must not be matched (false-suppression regression).
	it('does not match a foreign name-only lookalike', () => {
		expect(isCancelError({ message: '', name: 'CancelError' })).toBe(false);
	});

	it('does not detect other errors', () => {
		expect(isCancelError(new Error())).toBe(false);
		expect(isCancelError(new TypeError())).toBe(false);
	});
});

describe('createCancelSignal', () => {
	let result: ReturnType<typeof createCancelSignal>;

	beforeEach(() => {
		result = createCancelSignal();
	});

	it('returns controller members', () => {
		expect(result).toEqual({
			cancel: expect.any(Function),
			signal: expect.any(AbortSignal)
		});
	});

	it('brands the returned signal (isCancelSignal true)', () => {
		expect(isCancelSignal(result.signal)).toBe(true);
	});

	// Anti-stub: a raw AbortSignal carries no brand, so the check must be false — proves the brand
	// is a real own-prop, not a no-op that returns true for any signal.
	it('does not brand a plain AbortSignal', () => {
		expect(isCancelSignal(new AbortController().signal)).toBe(false);
	});

	it('brand property is own and non-enumerable', () => {
		const descriptor = Object.getOwnPropertyDescriptor(result.signal, Symbol.for('@cancjs/promise:cancel signal'));

		expect(descriptor).toBeDefined();
		expect(descriptor!.enumerable).toBe(false);
		expect(descriptor!.value).toBe(true);
	});

	it('brands the reason: cancel(string) sets signal.reason to a CancelError with that message', () => {
		const { cancel, signal } = result;

		const spy = jest.fn();
		signal.addEventListener('abort', spy);

		expect(() => { cancel('reason') }).not.toThrow();
		expect(signal.aborted).toBe(true);
		expect(isCancelError(signal.reason)).toBe(true);
		expect(signal.reason.message).toBe('reason');
		expect(spy).toHaveBeenCalled();
	});

	it('cancel() with no argument sets signal.reason to a fresh CancelError', () => {
		const { cancel, signal } = result;

		cancel();

		expect(signal.aborted).toBe(true);
		expect(isCancelError(signal.reason)).toBe(true);
	});

	it('cancel(cancelError) passes an existing CancelError through unwrapped (same identity)', () => {
		const { cancel, signal } = result;
		const cancelError = new CancelError('preexisting');

		cancel(cancelError);

		expect(signal.reason).toBe(cancelError);
	});

	it('cancel(object) wraps a non-CancelError object as the CancelError cause', () => {
		const { cancel, signal } = result;
		const reason = { x: 1 };

		cancel(reason);

		expect(isCancelError(signal.reason)).toBe(true);
		expect(signal.reason.cause).toBe(reason);
	});

	it('uses the default reason passed at creation when cancel() is called with no argument', () => {
		const { cancel, signal } = createCancelSignal('default-reason');

		cancel();

		expect(isCancelError(signal.reason)).toBe(true);
		expect(signal.reason.message).toBe('default-reason');
	});

	it('cancels a CancelablePromise via the signal option with the exact CancelError', async () => {
		const { cancel, signal } = createCancelSignal();

		const promise = new CancelablePromise(() => { /* never settles */ }, { signal });

		cancel('stop');

		let caught: any;
		await promise.catch(error => { caught = error; });

		expect(isCancelError(caught)).toBe(true);
		expect(caught).toBe(signal.reason);
		expect(caught.message).toBe('stop');
	});
});

describe('catchCancel', () => {
	it('returns cancel error', () => {
		const error = new CancelError();
		expect(catchCancel(error)).toBe(error);
	});

	it('rethrows any other error', () => {
		const error = new TypeError();

		try {
			catchCancel(error);
			throw new Error('catchCancel not threw')
		} catch (err) {
			expect(err).toBe(error);
		}
	});

	// todo: duck-check widening, a plain native Promise (foreign thenable) rejecting with a
	// CancelError is caught and returned, not just CancelablePromise instances.
	it('catches a CancelError from a plain native Promise', async () => {
		const nativePromise = Promise.reject(new CancelError('native reject'));

		const result = catchCancel(nativePromise as any);

		expect(result).toBeInstanceOf(CancelablePromise);
		await expect(result).resolves.toBeInstanceOf(CancelError);
	});

	// Non-CancelError rejection through the thenable branch must rethrow, not just the CancelError
	// side already covered above.
	it('rethrows via a plain native Promise rejecting with a non-CancelError', async () => {
		const error = new TypeError('boom');
		const nativePromise = Promise.reject(error);

		const result = catchCancel(nativePromise as any);

		await expect(result).rejects.toBe(error);
	});

	// default behavior (no options / abort:false) leaves a bare AbortError unmatched, must
	// still rethrow. Proves the {abort} option is not accidentally always-on.
	it('rethrows a plain AbortError by default (no abort option)', async () => {
		const nativePromise = Promise.reject(new AbortError());

		const result = catchCancel(nativePromise as any);

		await expect(result).rejects.toBeInstanceOf(AbortError);
	});

	it('with {abort:true} catches and returns a plain AbortError', async () => {
		const abortError = new AbortError();
		const nativePromise = Promise.reject(abortError);

		const result = catchCancel(nativePromise as any, { abort: true });

		await expect(result).resolves.toBe(abortError);
	});

	it('with {abort:true} returns a CancelError whose aborted getter is true', () => {
		const cancelError = new CancelError(undefined, { cause: new AbortError() });

		expect(cancelError.aborted).toBe(true);
		expect(catchCancel(cancelError, { abort: true })).toBe(cancelError);
	});

	// Bare-error overload: without {abort}, a bare AbortError is not a CancelError, so it throws
	// synchronously same as any other foreign error.
	it('bare-error form: throws a plain AbortError without the abort option', () => {
		const error = new AbortError();

		expect(() => catchCancel(error)).toThrow(error);
	});

	it('bare-error form: with {abort:true} returns a plain AbortError instead of throwing', () => {
		const error = new AbortError();

		expect(catchCancel(error, { abort: true })).toBe(error);
	});
});

describe('suppressCancel', () => {
	it('suppresses cancel error', () => {
		expect(suppressCancel(new CancelError())).toBe(undefined);
	});

	it('rethrows any other error', () => {
		const error = new TypeError();

		try {
			suppressCancel(error);
			throw new Error('catchCancel not threw')
		} catch (err) {
			expect(err).toBe(error);
		}
	});

	// todo: widened to a duck-check (isThenable) instead of `instanceof CancelablePromise`, so
	// a PLAIN native Promise rejecting with a CancelError is also suppressed correctly, the
	// brand-based isCancelError (`Symbol.for('@cancjs/promise:CancelError')`) makes this
	// detection copy/realm-safe regardless of what produced the rejection (mirrors the brand
	// check pattern used in cancel-error.spec.ts).
	it('suppresses a plain native Promise rejecting with a CancelError', async () => {
		const nativePromise = Promise.reject(new CancelError('native reject'));

		const result = suppressCancel(nativePromise as any);

		expect(result).toBeInstanceOf(CancelablePromise);
		await expect(result).resolves.toBe(undefined);
	});

	it('rethrows via a plain native Promise rejecting with a non-CancelError', async () => {
		const error = new TypeError('boom');
		const nativePromise = Promise.reject(error);

		const result = suppressCancel(nativePromise as any);

		await expect(result).rejects.toBe(error);
	});

	// default behavior (no options / abort:false) must RE-THROW a bare AbortError, proving
	// the {abort} option is opt-in, not always-on (anti-stub: would fail if abort matching were
	// unconditional).
	it('rethrows a plain AbortError by default (no abort option)', async () => {
		const nativePromise = Promise.reject(new AbortError());

		const result = suppressCancel(nativePromise as any);

		await expect(result).rejects.toBeInstanceOf(AbortError);
	});

	// Anti-stub: this must FAIL on current (pre-P19-4) code, since a bare AbortError is not a
	// CancelError and would rethrow without the {abort} option honored.
	it('with {abort:true} swallows a plain AbortError (resolves)', async () => {
		const nativePromise = Promise.reject(new AbortError());

		const result = suppressCancel(nativePromise as any, { abort: true });

		await expect(result).resolves.toBe(undefined);
	});

	// Bare-error overload equivalent of the pair above.
	it('bare-error form: throws a plain AbortError without the abort option', () => {
		const error = new AbortError();

		expect(() => suppressCancel(error)).toThrow(error);
	});

	it('bare-error form: with {abort:true} returns void instead of throwing', () => {
		const error = new AbortError();

		expect(suppressCancel(error, { abort: true })).toBe(undefined);
	});
});

describe('makeCancelable', () => {
	it('wraps a promise', () => {
		const promise = CancelablePromise.resolve();
		const wrappedPromise = makeCancelable(promise);
		expect(wrappedPromise).toEqual(expect.any(CancelablePromise));
		expect(wrappedPromise).not.toBe(promise);
	});

	it('resolves with wrapped promise when cancelled', async () => {
		const promise = CancelablePromise.resolve(1);

		await expect(makeCancelable(promise)).resolves.toBe(1);

		const wrappedPromise = makeCancelable(promise);

		await flushPromises();

		wrappedPromise.cancel();

		await expect(wrappedPromise).resolves.toBe(1);
		expect(wrappedPromise.isCanceled).toBe(false);
	});

	it('ignores wrapped promise when synchronously cancelled', async () => {
		const promise = CancelablePromise.resolve(1);

		await expect(makeCancelable(promise)).resolves.toBe(1);

		const wrappedPromise = makeCancelable(promise);

		wrappedPromise.cancel();

		await expect(wrappedPromise).rejects.toThrow();
		expect(wrappedPromise.isCanceled).toBe(true);
	});

	// isCancelable(promise) false branch, plain non-cancelable promise, no third-party .cancel
	// to invoke.
	it('does not attempt to cancel a plain non-cancelable promise', async () => {
		const promise = Promise.resolve(1);

		const wrappedPromise = makeCancelable(promise as any);
		wrappedPromise.cancel();

		await expect(wrappedPromise).rejects.toThrow();
	});

	it('cancels third-party cancelable when cancelled', async () => {
		let promiseReject: (reason?: any) => void;

		const promise = Object.assign(
			new Promise<never>((_resolve, reject) => {
				promiseReject = reject;
			}),
			{ cancel: jest.fn(() => promiseReject('Canceled')) }
		) as ICancelable<never>;

		const wrappedPromise = makeCancelable(promise);
		wrappedPromise.cancel();

		expect(promise.cancel).toHaveBeenCalled();
		await expect(wrappedPromise).rejects.toThrow();
	});
});
