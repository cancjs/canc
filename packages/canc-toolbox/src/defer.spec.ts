import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { defer } from './index';

describe('defer', () => {
	it('returns a promise plus resolve/reject (happy path)', async () => {
		const d = defer<number>();
		d.resolve(42);
		await expect(d.promise).resolves.toBe(42);
	});

	it('reject settles the promise as rejected', async () => {
		const d = defer<number>();
		const error = new Error('nope');
		d.reject(error);
		await expect(d.promise).rejects.toBe(error);
	});

	it('promise is a CancelablePromise', () => {
		const d = defer<string>();
		expect(d.promise).toBeInstanceOf(CancelablePromise);
	});

	it('exposes cancel on the deferred object', () => {
		const d = defer<number>();
		expect(typeof d.cancel).toBe('function');
	});

	it('destructured cancel works without a cast', () => {
		const { cancel } = defer<number>();
		expect(typeof cancel).toBe('function');
	});

	it('cancel is bound to the promise instance', async () => {
		const { promise, cancel } = defer<number>();
		cancel();
		const reason = await promise.catch((error) => error);
		expect(isCancelError(reason)).toBe(true);
	});

	it('cancel rejects with a CancelError', async () => {
		const d = defer<number>();
		d.cancel();
		const reason = await d.promise.catch((error) => error);
		expect(isCancelError(reason)).toBe(true);
	});

	it('resolve after cancel is a safe no-op', async () => {
		const d = defer<number>();
		d.cancel();
		await d.promise.catch(() => {/**/});
		expect(() => d.resolve(42)).not.toThrow();
	});
});
