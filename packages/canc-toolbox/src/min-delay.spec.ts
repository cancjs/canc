import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { minDelay } from './min-delay';

describe('minDelay', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it('resolves with the value but not before the floor (happy path)', async () => {
		jest.useFakeTimers();
		const promise = minDelay(Promise.resolve('v'), 500);
		let settled = false;
		void promise.then(() => { settled = true; });

		// Source resolves immediately, but the 500ms floor is not yet reached.
		await Promise.resolve();
		expect(settled).toBe(false);

		jest.advanceTimersByTime(500);
		await expect(promise).resolves.toBe('v');
	});

	it('rejection short-circuits the floor', async () => {
		jest.useFakeTimers();
		const error = new Error('early');
		const promise = minDelay(Promise.reject(error), 10000);
		const assertion = expect(promise).rejects.toBe(error);
		await assertion;
		expect(jest.getTimerCount()).toBe(0);
	});

	it('cancel propagation: canceling rejects with CancelError', async () => {
		const promise = minDelay(new Promise(() => {/* pending */}), 1000) as CancelablePromise<unknown>;
		promise.cancel();
		const reason = await promise.catch((e) => e);
		expect(isCancelError(reason)).toBe(true);
	});

	it('timer cleanup: no pending floor timer remains after cancel (fake timers)', () => {
		jest.useFakeTimers();
		const promise = minDelay(new Promise(() => {/* pending */}), 1000) as CancelablePromise<unknown>;
		expect(jest.getTimerCount()).toBe(1);
		promise.cancel();
		expect(jest.getTimerCount()).toBe(0);
	});

	it('timer cleanup: no pending timers remain after natural resolution (fake timers)', async () => {
		jest.useFakeTimers();
		const promise = minDelay(Promise.resolve('x'), 100);
		jest.advanceTimersByTime(100);
		await promise;
		expect(jest.getTimerCount()).toBe(0);
	});
});
