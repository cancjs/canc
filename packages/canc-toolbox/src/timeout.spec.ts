import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { timeout, timeoutFactory, TimeoutError, isTimeoutError } from './timeout';

describe('timeout', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it('resolves with the value when it settles in time (happy path)', async () => {
		await expect(timeout(Promise.resolve('fast'), 1000)).resolves.toBe('fast');
	});

	it('rejects with TimeoutError when the deadline elapses', async () => {
		jest.useFakeTimers();
		const pending = new Promise(() => {/* never settles */});
		const raced = timeout(pending, 100);
		const assertion = expect(raced).rejects.toBeInstanceOf(TimeoutError);
		jest.advanceTimersByTime(100);
		await assertion;
	});

	it('isTimeoutError identifies the error', () => {
		expect(isTimeoutError(new TimeoutError('x'))).toBe(true);
		expect(isTimeoutError(new Error('x'))).toBe(false);
	});

	it('cancels the underlying cancelable promise when the timeout wins', async () => {
		jest.useFakeTimers();
		const underlying = new CancelablePromise<never>(() => {/* never settles */});
		const cancelSpy = jest.spyOn(underlying, 'cancel');
		const raced = timeout(underlying, 100);
		const assertion = raced.catch(() => {/* swallow */});
		jest.advanceTimersByTime(100);
		await assertion;
		expect(cancelSpy).toHaveBeenCalled();
	});

	it('timer cleanup: no pending timers remain after the source resolves (fake timers)', async () => {
		jest.useFakeTimers();
		const raced = timeout(Promise.resolve('v'), 5000);
		await raced;
		expect(jest.getTimerCount()).toBe(0);
	});

	it('timer cleanup: no pending timers remain after cancel (fake timers)', () => {
		jest.useFakeTimers();
		const raced = timeout(new CancelablePromise(() => {/* pending */}), 5000) as CancelablePromise<unknown>;
		expect(jest.getTimerCount()).toBe(1);
		raced.cancel();
		expect(jest.getTimerCount()).toBe(0);
	});

	it('cancel propagation: canceling the race rejects with CancelError', async () => {
		const raced = timeout(new CancelablePromise(() => {/* pending */}), 5000) as CancelablePromise<unknown>;
		raced.cancel();
		const reason = await raced.catch((e) => e);
		expect(isCancelError(reason)).toBe(true);
	});

	it('native flavor: timeoutFactory(Promise) still races', async () => {
		const nativeTimeout = timeoutFactory(Promise as any);
		await expect(nativeTimeout(Promise.resolve('n'), 1000)).resolves.toBe('n');
	});
});
