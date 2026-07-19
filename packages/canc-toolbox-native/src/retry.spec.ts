import { retry } from './index';

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

	it('returns a plain native Promise, not a cancelable one', () => {
		const promise = retry(() => Promise.resolve('v'));
		expect(promise).toBeInstanceOf(Promise);
		expect('cancel' in promise).toBe(false);
	});

	it('no cancel: a pending backoff wait runs to completion and attempts continue', async () => {
		jest.useFakeTimers();
		const fn = jest.fn().mockRejectedValue(new Error('fail'));
		const promise = retry(fn, { retries: 3, minTimeout: 100, factor: 2 });
		promise.catch(() => {/* swallow */});

		await flushMicrotasks();
		expect(fn).toHaveBeenCalledTimes(1);

		jest.advanceTimersByTime(100);
		await flushMicrotasks();
		expect(fn).toHaveBeenCalledTimes(2);
	});
});
