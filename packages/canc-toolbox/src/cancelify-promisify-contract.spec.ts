import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { cancelify, promisify } from './index';

// Cross-module contract: cancelify and promisify both hand a consumer a cancel-time hook, and both
// must reject the returned promise with a branded CancelError regardless of which hook shape the
// caller uses. These checks exercise the two modules together through the public barrel, the way an
// integrator actually imports them, rather than through either module's own internal spec.
describe('cancelify + promisify cross-module contract', () => {
	it('cancelify: an imperative { promise, cancel } handle wired via ctx.handleCancel runs on cancel and rejects a branded CancelError', async () => {
		const cancel = jest.fn();

		const wrapped = cancelify(({ handleCancel }) => {
			const promise = new Promise<never>(() => {
				/* never settles on its own; only cancel() ends this */
			});
			handleCancel(cancel);
			return promise;
		});

		const result = wrapped() as CancelablePromise<never>;
		await Promise.resolve();

		result.cancel();

		const reason = await result.catch((e) => e);

		expect(cancel).toHaveBeenCalledTimes(1);
		expect(isCancelError(reason)).toBe(true);
		expect(result.isCanceled).toBe(true);
	});

	it('promisify: options.handleCancel fires with exactly (handle, args, getSignal, reason) when a pending call is canceled', async () => {
		const handle = { stop: jest.fn() };
		const fn = (a: number, cb: (err: any, value: number) => void) => {
			// A synchronous imperative handle (e.g. ClientRequest); the callback never fires on its own.
			return handle;
		};

		const hook = jest.fn();
		const wrapped = promisify(fn, { handleCancel: hook });

		const result = wrapped(9) as CancelablePromise<number>;
		await Promise.resolve();

		result.cancel('teardown');

		const reason = await result.catch((e) => e);
		expect(isCancelError(reason)).toBe(true);

		expect(hook).toHaveBeenCalledTimes(1);
		expect(hook.mock.calls[0]).toHaveLength(4);

		const [seenHandle, seenArgs, seenGetSignal, seenReason] = hook.mock.calls[0];
		expect(seenHandle).toBe(handle);
		expect(seenArgs).toEqual([9]);
		expect(typeof seenGetSignal).toBe('function');
		expect(seenReason).toBe('teardown');
	});
});
