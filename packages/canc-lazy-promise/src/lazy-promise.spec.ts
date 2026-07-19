import { CancelablePromise, CancelError, setPromiseImpl } from '@cancjs/promise';
import { lazy, CancelableLazyPromise } from './lazy-promise';

describe('CancelableLazyPromise', () => {
	afterEach(() => {
		// Clear any registry override a test may have set.
		setPromiseImpl(undefined);
	});

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

	describe('cancel before start', () => {
		it('never runs the executor and rejects with CancelError', async () => {
			const executor = jest.fn((resolve: (v: number) => void) => resolve(1));
			const p = lazy<number>(executor);

			p.cancel('gone');

			expect(executor).not.toHaveBeenCalled();

			await expect(Promise.resolve(p)).rejects.toBeInstanceOf(CancelError);
			expect(executor).not.toHaveBeenCalled();
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

	describe('teardown', () => {
		it('runs a handleCancel-registered teardown on cancel', async () => {
			const teardown = jest.fn();
			const p = lazy<number>((_resolve, _reject, handleCancel) => {
				handleCancel(teardown);
			});

			// Subscribe to start the executor, then cancel.
			p.then(() => undefined, () => undefined);
			await Promise.resolve();
			p.cancel('stop');

			expect(teardown).toHaveBeenCalledTimes(1);
		});

		it('runs a returned teardown fn on cancel', async () => {
			const teardown = jest.fn();
			const p = lazy<number>(() => teardown);

			p.then(() => undefined, () => undefined);
			await Promise.resolve();
			p.cancel('stop');

			expect(teardown).toHaveBeenCalledTimes(1);
		});
	});

	describe('interop', () => {
		it('is adopted by CancelablePromise.resolve as a PromiseLike', async () => {
			const p = lazy<string>((resolve) => resolve('ok'));
			const value = await CancelablePromise.resolve(p);
			expect(value).toBe('ok');
		});
	});

	describe('resettable', () => {
		it('re-runs the executor after all consumers cancel before settle', async () => {
			let runs = 0;
			const p = lazy<number>(
				(resolve) => {
					runs++;
					// Never settle synchronously so the pre-settle cancel window stays open.
					setTimeout(() => resolve(runs), 1000);
				},
				{ resettable: true },
			);

			// First subscription starts run #1.
			p.then(() => undefined, () => undefined);
			await Promise.resolve();
			expect(runs).toBe(1);

			// Last (only) consumer cancels before settle -> reset to unstarted.
			p.cancel('abort');
			expect(p.started).toBe(false);

			// New subscription re-runs the executor.
			p.then(() => undefined, () => undefined);
			await Promise.resolve();
			expect(runs).toBe(2);
		});

		it('keeps running while other consumers remain', () => {
			let runs = 0;
			const p = lazy<number>(
				(resolve) => {
					runs++;
					setTimeout(() => resolve(1), 1000);
				},
				{ resettable: true },
			);

			p.then(() => undefined, () => undefined);
			p.then(() => undefined, () => undefined);
			expect(runs).toBe(1);

			// One consumer cancels; another remains -> stays started, no reset.
			p.cancel();
			expect(p.started).toBe(true);
			expect(runs).toBe(1);
		});
	});

	describe('DI / impl resolution', () => {
		it('honors a per-call impl override', async () => {
			const p = lazy<number>((resolve) => resolve(5), { impl: Promise });
			expect(await p).toBe(5);
		});

		it('honors a class static override', async () => {
			class MyLazy<T> extends CancelableLazyPromise<T> {
				static PromiseImpl = Promise as any;
			}
			const p = new MyLazy<number>((resolve) => resolve(9));
			expect(await p).toBe(9);
		});
	});
});
