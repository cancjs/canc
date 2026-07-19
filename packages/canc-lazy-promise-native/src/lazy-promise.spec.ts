import { lazy, LazyPromise } from './lazy-promise';

describe('LazyPromise', () => {
	describe('laziness', () => {
		it('does not run the executor until first subscription', async () => {
			const executor = jest.fn((resolve: (v: number) => void) => resolve(42));
			const p = lazy<number>(executor);

			expect(executor).not.toHaveBeenCalled();
			expect(p.started).toBe(false);

			const value = await p;

			expect(executor).toHaveBeenCalledTimes(1);
			expect(p.started).toBe(true);
			expect(value).toBe(42);
		});

		it('runs the executor on catch/finally too', async () => {
			const onCatch = jest.fn((resolve: (v: number) => void) => resolve(1));
			await lazy<number>(onCatch).catch(() => 0);
			expect(onCatch).toHaveBeenCalledTimes(1);

			const onFinally = jest.fn((resolve: (v: number) => void) => resolve(1));
			await lazy<number>(onFinally).finally(() => undefined);
			expect(onFinally).toHaveBeenCalledTimes(1);
		});
	});

	describe('single execution', () => {
		it('runs the executor once for multiple subscribers, all sharing the value', async () => {
			const executor = jest.fn((resolve: (v: number) => void) => resolve(7));
			const p = lazy<number>(executor);

			const [a, b, c] = await Promise.all([
				Promise.resolve(p.then((v) => v)),
				Promise.resolve(p.then((v) => v)),
				Promise.resolve(p.then((v) => v)),
			]);

			expect(executor).toHaveBeenCalledTimes(1);
			expect([a, b, c]).toEqual([7, 7, 7]);
		});
	});

	describe('interop', () => {
		it('is adopted by native Promise.resolve as a PromiseLike', async () => {
			const p = lazy<string>((resolve) => resolve('ok'));
			const value = await Promise.resolve(p);
			expect(value).toBe('ok');
		});

		it('is an instance of LazyPromise', () => {
			const p = lazy<number>((resolve) => resolve(1));
			expect(p).toBeInstanceOf(LazyPromise);
		});
	});

	describe('no cancellation surface', () => {
		it('does not expose cancel on the lazy value', () => {
			const p = lazy<number>((resolve) => resolve(Promise.resolve(1)));
			expect('cancel' in p).toBe(false);
		});

		it('does not expose cancel on the resolved inner promise', async () => {
			const p = lazy<number>((resolve) => resolve(1));
			const inner = Promise.resolve(p);
			expect('cancel' in inner).toBe(false);
			await inner;
		});
	});
});
