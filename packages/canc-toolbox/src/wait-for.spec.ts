import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { waitFor } from './wait-for';

describe('waitFor', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it('resolves once the condition becomes truthy (happy path)', async () => {
		let flag = false;
		setTimeout(() => { flag = true; }, 30);
		await waitFor(() => flag, { interval: 5 });
		expect(flag).toBe(true);
	});

	it('resolves immediately when the condition is already truthy', async () => {
		await expect(waitFor(() => true)).resolves.toBeUndefined();
	});

	it('rejects when the condition function throws', async () => {
		const error = new Error('boom');
		await expect(waitFor(() => { throw error; })).rejects.toBe(error);
	});

	it('cancel propagation: canceling rejects with CancelError', async () => {
		const promise = waitFor(() => false, { interval: 10 }) as CancelablePromise<void>;
		promise.cancel();
		const reason = await promise.catch((e) => e);
		expect(isCancelError(reason)).toBe(true);
	});

	it('timer cleanup: no pending poll timer remains after cancel (fake timers)', async () => {
		jest.useFakeTimers();
		const promise = waitFor(() => false, { interval: 20 }) as CancelablePromise<void>;
		// The first poll schedules its follow-up timer after a microtask (the condition is awaited),
		// so drain microtasks before asserting the timer exists.
		await Promise.resolve();
		expect(jest.getTimerCount()).toBe(1);
		promise.cancel();
		expect(jest.getTimerCount()).toBe(0);
	});

	it('timer cleanup: no pending timers remain after natural resolution (fake timers)', async () => {
		jest.useFakeTimers();
		let flag = false;
		const promise = waitFor(() => flag, { interval: 20 });
		// Let the first (false) poll settle and schedule its follow-up timer.
		await Promise.resolve();
		await Promise.resolve();
		flag = true;
		jest.advanceTimersByTime(20);
		await promise;
		expect(jest.getTimerCount()).toBe(0);
	});
});
