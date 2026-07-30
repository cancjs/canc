import { CancelablePromise } from './cancelable-promise';
import { CancelError } from './cancel-error';

/**
 * Settle tracking without unhandled-rejection suppression.
 *
 * Edge-case inventory as individual tests. The unhandledRejection-FIRES /
 * -suppressed assertions (items 1, 3, 4) live in unhandled-rejection.spec.ts because jest's
 * runner swallows the process event; here we assert the observable STATE + cancel-handler
 * behavior that these edge cases must produce.
 */

const NativePromise = Promise;

function macrotask(): Promise<void> {
	return new NativePromise(resolve => setTimeout(resolve, 10));
}

describe('settle tracking (state + handlers)', () => {
	// Item 2: cancel() -> promise CANCELED, not cancelable.
	it('item 2: cancel() transitions to CANCELED and is no longer cancelable', async () => {
		const promise = new CancelablePromise(() => {/**/});
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		promise.cancel('canceled');

		expect(promise.isCanceled).toBe(true);
		expect(promise.isCancelable).toBe(false);

		await expect(promise).rejects.toBeInstanceOf(CancelError);
	});

	// Item 3: sync reject(CancelError) in executor -> CANCELED state (parity).
	it('item 3: sync reject(CancelError) in executor transitions to CANCELED', async () => {
		const promise = new CancelablePromise((_resolve, reject) => reject(new CancelError('sync-cancel')));
		promise.catch(() => {/**/});

		expect(promise.isCanceled).toBe(true);

		await macrotask();
	});

	// Item 4: async reject(CancelError) -> CANCELED state.
	it('item 4: async reject(CancelError) transitions to CANCELED', async () => {
		const promise = new CancelablePromise((_resolve, reject) => {
			setTimeout(() => reject(new CancelError('async-cancel')), 0);
		});
		promise.catch(() => {/**/});

		await macrotask();

		expect(promise.isCanceled).toBe(true);
	});

	// Item 5: throw CancelError in then-handler -> derived promise CANCELED (subchain cancel feature).
	it('item 5: throwing CancelError in then-handler cancels the derived subchain', async () => {
		const base = CancelablePromise.resolve('value');
		const derived = base.then(() => {
			throw new CancelError('thrown-in-then');
		});
		derived.catch(() => {/**/});

		await macrotask();

		expect(derived.isCanceled).toBe(true);
	});

	// Item 6: thenable rejecting CancelError adopted via resolve() (forceCancelable) -> CANCELED.
	it('item 6: adopted thenable rejecting CancelError cancels the outer promise', async () => {
		const inner = new CancelablePromise((_resolve, reject) => {
			setTimeout(() => reject(new CancelError('inner-cancel')), 0);
		});

		const outer = CancelablePromise.resolve(inner, { forceCancelable: true });
		outer.catch(() => {/**/});

		await macrotask();

		expect(outer.isCanceled).toBe(true);
	});

	// Item 7: late .catch() attach after a plain rejection still observes the reason.
	it('item 7: late catch after plain rejection observes the rejection reason', async () => {
		const promise = new CancelablePromise((_resolve, reject) => reject(new Error('late')));

		const caught: any[] = [];
		promise.catch(err => { caught.push(err); });

		await macrotask();

		expect(caught.length).toBe(1);
		expect(caught[0].message).toBe('late');
	});

	// Item 8: canceled parent is not cancelable -> deriving from it does not open a live cancel chain.
	it('item 8: canceled parent is not cancelable and children adopt cancellation', async () => {
		const parent = new CancelablePromise(() => {/**/});
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		parent.cancel();

		expect(parent.isCancelable).toBe(false);

		const child = parent.then(() => {/**/});
		child.catch(() => {/**/});

		await macrotask();

		expect(child.isCanceled).toBe(true);
	});

	// Item 9: forceCancelable:false FORCE_PENDING path -> NOT cancelable, resolves normally.
	it('item 9: forceCancelable:false FORCE_PENDING promise is not cancelable', async () => {
		const inner = CancelablePromise.resolve('inner-value');
		const promise = CancelablePromise.resolve(inner, { forceCancelable: false });

		expect(promise.isCancelable).toBe(false);

		await expect(promise).resolves.toBe('inner-value');
	});

	// Item 10: external reject(CancelError) FIRES registered cancel handlers (full parity).
	it('item 10: external reject(CancelError) fires registered cancel handlers', async () => {
		const handler = jest.fn();

		const promise = new CancelablePromise((_resolve, reject, { handleCancel }) => {
			handleCancel(handler);
			setTimeout(() => reject(new CancelError('external')), 0);
		});
		promise.catch(() => {/**/});

		await macrotask();

		expect(promise.isCanceled).toBe(true);
		expect(handler).toHaveBeenCalledTimes(1);
	});

	// No-double-fire regression: cancel() sets CANCELED before _reject, so the reject wrapper's
	// external-cancel branch is skipped -> handlers fire exactly once.
	it('regression: cancel() fires handlers exactly once (no double-fire via reject wrapper)', async () => {
		const handler = jest.fn();

		const promise = new CancelablePromise((_resolve, _reject, { handleCancel }) => {
			handleCancel(handler);
		});

		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		promise.cancel('once');

		await macrotask();

		expect(handler).toHaveBeenCalledTimes(1);
	});

	// handleCancel registered AFTER a synchronous external reject(CancelError) -> no-op.
	it('handleCancel after sync reject(CancelError) in executor is a no-op', async () => {
		const lateHandler = jest.fn();

		const promise = new CancelablePromise((_resolve, reject, { handleCancel }) => {
			reject(new CancelError('sync-external'));
			handleCancel(lateHandler);
		});
		promise.catch(() => {/**/});

		await macrotask();

		expect(promise.isCanceled).toBe(true);
		expect(lateHandler).not.toHaveBeenCalled();
	});

	// External reject(CancelError) fires handlers exactly once (no double-fire on parity path).
	it('external reject(CancelError) fires handlers exactly once', async () => {
		const handler = jest.fn();

		const promise = new CancelablePromise((_resolve, reject, { handleCancel }) => {
			handleCancel(handler);
			setTimeout(() => reject(new CancelError('external-once')), 0);
		});
		promise.catch(() => {/**/});

		await macrotask();

		expect(handler).toHaveBeenCalledTimes(1);
	});
});
