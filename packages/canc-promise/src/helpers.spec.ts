import { CancelError } from './cancel-error';
import {
	catchCancel,
	createAbortSignal,
	forceCancelable,
	isCancelError,
	suppressCancel
} from './helpers';
import { CancelablePromise, ICancelable } from './cancelable-promise';

function flushPromises(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
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

describe('createAbortSignal', () => {
	let result: ReturnType<typeof createAbortSignal>;

	beforeEach(() => {
		result = createAbortSignal();
	});

	it('returns controller members', () => {
		expect(result).toEqual({
			abort: expect.any(Function),
			signal: expect.any(AbortSignal)
		});
	});

	it('brands the reason: abort(string) sets signal.reason to a CancelError with that message', () => {
		const { abort, signal } = result;

		const spy = jest.fn();
		signal.addEventListener('abort', spy);

		expect(() => { abort('reason') }).not.toThrow();
		expect(signal.aborted).toBe(true);
		expect(isCancelError(signal.reason)).toBe(true);
		expect(signal.reason.message).toBe('reason');
		expect(spy).toHaveBeenCalled();
	});

	it('abort() with no argument sets signal.reason to a fresh CancelError', () => {
		const { abort, signal } = result;

		abort();

		expect(signal.aborted).toBe(true);
		expect(isCancelError(signal.reason)).toBe(true);
	});

	it('abort(cancelError) passes an existing CancelError through unwrapped (same identity)', () => {
		const { abort, signal } = result;
		const cancelError = new CancelError('preexisting');

		abort(cancelError);

		expect(signal.reason).toBe(cancelError);
	});

	it('abort(object) wraps a non-CancelError object as the CancelError cause', () => {
		const { abort, signal } = result;
		const reason = { x: 1 };

		abort(reason);

		expect(isCancelError(signal.reason)).toBe(true);
		expect(signal.reason.cause).toBe(reason);
	});

	it('uses the default reason passed at creation when abort() is called with no argument', () => {
		const { abort, signal } = createAbortSignal('default-reason');

		abort();

		expect(isCancelError(signal.reason)).toBe(true);
		expect(signal.reason.message).toBe('default-reason');
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
});

describe('forceCancelable', () => {
	it('wraps a promise', () => {
		const promise = CancelablePromise.resolve();
		const forcedCancelablePromise = forceCancelable(promise);
		expect(forcedCancelablePromise).toEqual(expect.any(CancelablePromise));
		expect(forcedCancelablePromise).not.toBe(promise);
	});

	it('resolves with wrapped promise when cancelled', async () => {
		const promise = CancelablePromise.resolve(1);

		await expect(forceCancelable(promise)).resolves.toBe(1);

		const forcedCancelablePromise = forceCancelable(promise);

		await flushPromises();

		forcedCancelablePromise.cancel();

		await expect(forcedCancelablePromise).resolves.toBe(1);
		expect(forcedCancelablePromise.isCanceled).toBe(false);
	});

	it('ignores wrapped promise when synchronously cancelled', async () => {
		const promise = CancelablePromise.resolve(1);

		await expect(forceCancelable(promise)).resolves.toBe(1);

		const forcedCancelablePromise = forceCancelable(promise);

		forcedCancelablePromise.cancel();

		await expect(forcedCancelablePromise).rejects.toThrow();
		expect(forcedCancelablePromise.isCanceled).toBe(true);
	});

	// isCancelable(promise) false branch, plain non-cancelable promise, no third-party .cancel
	// to invoke.
	it('does not attempt to cancel a plain non-cancelable promise', async () => {
		const promise = Promise.resolve(1);

		const forcedCancelablePromise = forceCancelable(promise as any);
		forcedCancelablePromise.cancel();

		await expect(forcedCancelablePromise).rejects.toThrow();
	});

	it('cancels third-party cancelable when cancelled', async () => {
		let promiseReject: (reason?: any) => void;

		const promise = Object.assign(
			new Promise<never>((_resolve, reject) => {
				promiseReject = reject;
			}),
			{ cancel: jest.fn(() => promiseReject('Canceled')) }
		) as ICancelable<never>;

		const forcedCancelablePromise = forceCancelable(promise);
		forcedCancelablePromise.cancel();

		expect(promise.cancel).toHaveBeenCalled();
		await expect(forcedCancelablePromise).rejects.toThrow();
	});
});
