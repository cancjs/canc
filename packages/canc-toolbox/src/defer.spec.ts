import { CancelablePromise, isCancelError } from '@cancjs/promise';
import { defer, deferFactory } from './defer';

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

	it('produces a CancelablePromise by default (cancel propagation)', async () => {
		const d = defer<number>();
		expect(d.promise).toBeInstanceOf(CancelablePromise);
		(d.promise as CancelablePromise<number>).cancel();
		const reason = await d.promise.catch((e) => e);
		expect(isCancelError(reason)).toBe(true);
	});

	it('deferFactory binds native Promise (reduced flavor)', async () => {
		const nativeDefer = deferFactory(Promise as any);
		const d = nativeDefer<string>();
		expect(d.promise).toBeInstanceOf(Promise);
		expect(d.promise).not.toBeInstanceOf(CancelablePromise);
		d.resolve('ok');
		await expect(d.promise).resolves.toBe('ok');
	});
});
