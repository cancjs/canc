import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { delay, delayFactory } from './delay';

describe('delay', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it('resolves with the value after the given time (happy path)', async () => {
		const promise = delay(50, 'done');
		const result = await promise;
		expect(result).toBe('done');
	});

	it('resolves undefined when no value is given', async () => {
		await expect(delay(10)).resolves.toBeUndefined();
	});

	it('returns a CancelablePromise by default', () => {
		const promise = delay(10);
		expect(promise).toBeInstanceOf(CancelablePromise);
		(promise as CancelablePromise<void>).cancel();
	});

	it('cancel propagation: canceling rejects with CancelError', async () => {
		const promise = delay(1000) as CancelablePromise<void>;
		promise.cancel();
		await expect(promise).rejects.toThrow();
		const reason = await promise.catch((error) => error);
		expect(isCancelError(reason)).toBe(true);
	});

	it('timer cleanup: no pending timers remain after cancel (fake timers)', () => {
		jest.useFakeTimers();
		const promise = delay(1000) as CancelablePromise<void>;
		expect(jest.getTimerCount()).toBe(1);
		promise.cancel();
		expect(jest.getTimerCount()).toBe(0);
	});

	it('timer cleanup: no pending timers remain after natural resolution (fake timers)', async () => {
		jest.useFakeTimers();
		const promise = delay(1000, 'x');
		jest.advanceTimersByTime(1000);
		await promise;
		expect(jest.getTimerCount()).toBe(0);
	});

	it('delayFactory binds an implementation for its produced fn', async () => {
		const boundDelay = delayFactory(CancelablePromise as any);
		await expect(boundDelay(10, 7)).resolves.toBe(7);
	});
});
