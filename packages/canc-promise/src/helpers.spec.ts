import { CancelError } from './cancel-error';
import {
	catchCancel,
	createAbortSignal,
	createCancelRef,
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

	it('duck-types cancel error', () => {
		expect(isCancelError({ message: '', name: 'CancelError' })).toBe(true);
	});

	it('does not detect other errors', () => {
		expect(isCancelError(new Error())).toBe(false);
		expect(isCancelError(new TypeError())).toBe(false);
	});
});

describe('createCancelRef', () => {
	it('returns empty ref object', () => {
		expect(createCancelRef()).toEqual({ cancel: null });
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

	it('returns bound abort', () => {
		const { abort, signal } = result;

		const spy = jest.fn();
		signal.addEventListener('abort', spy);

		expect(() => { abort('reason') }).not.toThrow();
		expect(signal.aborted).toBe(true);
		expect(signal.reason).toBe('reason');
		expect(spy).toHaveBeenCalled();
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
