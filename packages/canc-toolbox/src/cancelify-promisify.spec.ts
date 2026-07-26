import { CancelablePromise, CancelError, createCancelSignal, isCancelError } from '@cancjs/promise';
import { cancelify } from './cancelify';
import { promisify } from './index';

// Exercises cancelify + promisify + the branded createCancelSignal end-to-end, across real
// (non-mocked) AbortController plumbing, to catch integration gaps a unit test per file would
// miss. Not a substitute for the per-file suites; this is the cross-package check.

describe('cancelify against a real fetch-shaped call', () => {
	it('cancels the returned promise and aborts the underlying signal with a CancelError reason', async () => {
		let capturedInit: { signal?: AbortSignal } | undefined;

		// A fetch-shaped mock: takes (url, init) and rejects when init.signal aborts, exactly like
		// the platform fetch does.
		const fetchLike = (signal: AbortSignal, args: [string, { signal?: AbortSignal }?]) => {
			const [, init] = args;
			capturedInit = { signal: init?.signal ?? signal };
			const abortSignal = init?.signal ?? signal;

			return new Promise((resolve, reject) => {
				abortSignal.addEventListener('abort', () => {
					reject(abortSignal.reason);
				});
			});
		};

		const cancelableFetch = cancelify(
			({ getSignal }, args: [string]) => {
				const signal = getSignal();
				return fetchLike(signal, [args[0], { signal }]);
			},
		);

		const promise = cancelableFetch('https://example.test/resource');
		await Promise.resolve();

		promise.cancel();

		const reason = await promise.catch((e) => e);

		expect(isCancelError(reason)).toBe(true);
		expect(promise.isCanceled).toBe(true);
		expect(capturedInit?.signal?.aborted).toBe(true);
		expect(isCancelError(capturedInit?.signal?.reason)).toBe(true);
	});
});

describe('promisify against a real errfirst setTimeout-based fn', () => {
	it('resolves the callback value', async () => {
		const errfirstFn = (cb: (err: any, value?: number) => void) => {
			setTimeout(() => cb(null, 42), 0);
		};

		const wrapped = promisify(errfirstFn);

		await expect(wrapped()).resolves.toBe(42);
	});

	it('short-circuits on cancel: promise rejects CancelError, late callback is a no-op', async () => {
		let firedCallback: ((err: any, value?: number) => void) | undefined;

		const errfirstFn = (cb: (err: any, value?: number) => void) => {
			firedCallback = cb;
			// Simulate a slow async op: the real callback fires only after we've already canceled.
			setTimeout(() => cb(null, 42), 50);
		};

		const wrapped = promisify(errfirstFn);
		const promise = wrapped() as CancelablePromise<number>;

		promise.cancel();

		const reason = await promise.catch((e) => e);
		expect(isCancelError(reason)).toBe(true);
		expect(promise.isCanceled).toBe(true);

		// The late callback firing after cancel must not throw and must not flip the settlement.
		expect(() => firedCallback?.(null, 42)).not.toThrow();
	});
});

describe('branded createCancelSignal', () => {
	it('cancel() mints a signal.reason that is a CancelError', () => {
		const { cancel, signal } = createCancelSignal();

		cancel();

		expect(isCancelError(signal.reason)).toBe(true);
	});

	it('a {signal}-option CancelablePromise cancels with that exact CancelError', async () => {
		const { cancel, signal } = createCancelSignal();

		const promise = new CancelablePromise(() => {}, { signal });

		cancel('stop');

		const reason = await promise.catch((e) => e);

		expect(isCancelError(reason)).toBe(true);
		expect(reason).toBe(signal.reason);
		expect((reason as CancelError).message).toBe('stop');
		expect(promise.isCanceled).toBe(true);
	});
});
