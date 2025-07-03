import { CancelablePromise, PromiseImpl, setPromiseImpl } from '@cancjs/promise';
import { delay } from './delay';

// A distinct second implementation used to prove the injection mechanism works with an impl OTHER
// than CancelablePromise. Rather than `class X extends Promise` (which the shared es5 target cannot
// subclass from a native builtin), each marker impl is a constructor that builds a real native
// Promise via Reflect.construct and records which impl created each instance in a WeakSet, so the
// test can assert precedence by identity without relying on instanceof across the es5 boundary.
function makeMarkerImpl(): PromiseImpl & { made(value: unknown): boolean } {
	const built = new WeakSet<object>();

	function MarkerPromise(this: unknown, executor: (res: any, rej: any) => void) {
		const promise = Reflect.construct(Promise, [executor], MarkerPromise as any);
		built.add(promise as object);
		return promise;
	}

	MarkerPromise.prototype = Object.create(Promise.prototype);
	(MarkerPromise as any).resolve = Promise.resolve.bind(Promise);
	(MarkerPromise as any).reject = Promise.reject.bind(Promise);
	(MarkerPromise as any).race = Promise.race.bind(Promise);
	(MarkerPromise as any).made = (value: unknown) => typeof value === 'object' && value !== null && built.has(value as object);

	return MarkerPromise as unknown as PromiseImpl & { made(value: unknown): boolean };
}

describe('impl precedence (options > registry > default)', () => {
	afterEach(() => {
		// Clear the registry so leakage cannot affect other suites.
		setPromiseImpl(undefined);
	});

	it('default: falls back to the built-in CancelablePromise when nothing is registered', () => {
		const promise = delay(10);
		expect(promise).toBeInstanceOf(CancelablePromise);
		(promise as CancelablePromise<void>).cancel();
	});

	it('registry: a registered impl is used over the built-in default', async () => {
		const registryImpl = makeMarkerImpl();
		setPromiseImpl(registryImpl);
		const promise = delay(1, 'v');
		expect(registryImpl.made(promise)).toBe(true);
		expect(promise).not.toBeInstanceOf(CancelablePromise);
		await expect(promise).resolves.toBe('v');
	});

	it('options: a per-call options.impl wins over the registry', async () => {
		const registryImpl = makeMarkerImpl();
		const optionImpl = makeMarkerImpl();
		setPromiseImpl(registryImpl);
		const promise = delay(1, 'v', { impl: optionImpl });
		expect(optionImpl.made(promise)).toBe(true);
		expect(registryImpl.made(promise)).toBe(false);
		await expect(promise).resolves.toBe('v');
	});

	it('pluggable smoke: a plain native Promise as the second impl produces a working promise', async () => {
		const promise = delay(1, 'native', { impl: Promise as unknown as PromiseImpl });
		expect(promise).toBeInstanceOf(Promise);
		expect(promise).not.toBeInstanceOf(CancelablePromise);
		await expect(promise).resolves.toBe('native');
	});
});
