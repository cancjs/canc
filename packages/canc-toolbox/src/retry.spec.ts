import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { retry } from './retry';

// Drain the microtask queue enough times to let an attempt's promise chain settle and schedule its
// backoff timer, without depending on the exact number of internal microtask hops.
async function flushMicrotasks() {
	for (let i = 0; i < 20; i++) {
		await Promise.resolve();
	}
}

describe('retry', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it('resolves on the first success (happy path)', async () => {
		const fn = jest.fn().mockResolvedValue('ok');
		await expect(retry(fn, { retries: 3 })).resolves.toBe('ok');
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('retries until success', async () => {
		let calls = 0;
		const fn = jest.fn().mockImplementation(() => {
			calls++;
			return calls < 3 ? Promise.reject(new Error('fail')) : Promise.resolve('third');
		});
		await expect(retry(fn, { retries: 5, minTimeout: 0 })).resolves.toBe('third');
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it('rejects with the last error after exhausting retries', async () => {
		const error = new Error('always');
		const fn = jest.fn().mockRejectedValue(error);
		await expect(retry(fn, { retries: 2, minTimeout: 0 })).rejects.toBe(error);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('cancel-aware: canceling during a backoff wait stops further attempts', async () => {
		jest.useFakeTimers();
		const fn = jest.fn().mockRejectedValue(new Error('fail'));
		const promise = retry(fn, { retries: 5, minTimeout: 1000 }) as CancelablePromise<unknown>;

		// First attempt runs and fails, scheduling a backoff timer.
		await flushMicrotasks();
		expect(fn).toHaveBeenCalledTimes(1);
		expect(jest.getTimerCount()).toBe(1);

		promise.cancel();
		expect(jest.getTimerCount()).toBe(0);

		// Advancing past the backoff must NOT trigger another attempt.
		jest.advanceTimersByTime(5000);
		await flushMicrotasks();
		expect(fn).toHaveBeenCalledTimes(1);

		const reason = await promise.catch((e) => e);
		expect(isCancelError(reason)).toBe(true);
	});

	it('applies exponential backoff between attempts (fake timers)', async () => {
		jest.useFakeTimers();
		const fn = jest.fn().mockRejectedValue(new Error('fail'));
		const promise = retry(fn, { retries: 3, minTimeout: 100, factor: 2 });
		promise.catch(() => {/* swallow */});

		await flushMicrotasks();
		expect(fn).toHaveBeenCalledTimes(1);

		// First backoff = 100 * 2^0 = 100ms.
		jest.advanceTimersByTime(100);
		await flushMicrotasks();
		expect(fn).toHaveBeenCalledTimes(2);

		// Second backoff = 100 * 2^1 = 200ms.
		jest.advanceTimersByTime(200);
		await flushMicrotasks();
		expect(fn).toHaveBeenCalledTimes(3);
	});
});
